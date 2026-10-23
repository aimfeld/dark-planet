// Boot: load the data, run the fixed 40 Hz game loop (menus, levels) and draw the classic view.

import { Music } from './audio/music';
import { Sfx } from './audio/sfx';
import { loadGameData, useSpriteLanguage } from './data';
import { DEFAULT_SETTINGS, Game } from './game';
import { Keyboard } from './input/keyboard';
import { toggleFullscreen } from './input/fullscreen';
import { Gamepad } from './input/gamepad';
import { keyLegend } from './input/keyLegend';
import { strings, systemLanguage, type Strings } from './i18n';
import { Mouse } from './input/mouse';
import { playerInputs } from './input/players';
import { TouchControls, touchLayout, type Insets, type TouchKey, type TouchLayout } from './input/touch';
import { ClassicView } from './render/classicView';
import { REMASTER_METHOD } from './render/hiResView';
import { Recorder, type Recording } from './recording';
import type { MenuInput, SaveSlot, Settings } from './screens/proc';
import { createWorld } from './sim/state';
import { Video } from './video';

const TICK_MS = 1000 / 40; // decision (user, session 3): fixed 40 Hz, 1 tick = 1 original frame
const MAX_TICKS_PER_FRAME = 8; // after a stall, catch up at most this much instead of spiralling
const SETTINGS_KEY = 'darkplanet.settings'; // SETTINGS.DAT
const SAVE_KEY = 'darkplanet.save'; // SAVE.DAT, base64
/** A phone or tablet: the primary pointer is a finger. */
const TOUCH_DEVICE = window.matchMedia('(pointer: coarse)').matches;
const NO_KEYS: readonly TouchKey[] = [];
const displayMode = (mode: string) => window.matchMedia(`(display-mode: ${mode})`).matches;
/** Started as the installed app (PWA), not in a browser tab; iOS reports it as navigator.standalone. */
const INSTALLED =
  ['fullscreen', 'standalone', 'minimal-ui'].some(displayMode) || (navigator as Navigator & { standalone?: boolean }).standalone === true;

function loadSettings(): Settings {
  const s = structuredClone(DEFAULT_SETTINGS);
  if (TOUCH_DEVICE) s.control = [5, 1]; // P1 touch (P2 the keyboard, for a tablet with one)
  s.language = systemLanguage();
  try {
    Object.assign(s, JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}'));
  } catch {
    // no storage (private window) or a broken entry: the defaults
  }
  return s;
}

function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // not persisted
  }
}

const saveSlot: SaveSlot = {
  read() {
    try {
      const b64 = localStorage.getItem(SAVE_KEY);
      return b64 === null ? null : Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    } catch {
      return null;
    }
  },
  write(bytes) {
    try {
      localStorage.setItem(SAVE_KEY, btoa(String.fromCharCode(...bytes)));
    } catch {
      // not persisted
    }
  },
};

/** The notch and rounded corners (viewport-fit=cover), read from CSS env(). */
function safeInsets(): Insets {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) ' +
    'env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const insets = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0,
    b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  probe.remove();
  return insets;
}

/** The touch layout for the window, recomputed when its size changes. */
function layoutCache(cornerButtons: number): () => TouchLayout {
  let key = '';
  let layout: TouchLayout;
  return () => {
    const k = `${window.innerWidth}x${window.innerHeight}`;
    if (k !== key) {
      key = k;
      layout = touchLayout(window.innerWidth, window.innerHeight, safeInsets(), cornerButtons);
    }
    return layout;
  };
}

/** Fullscreen (and on a phone or tablet the landscape lock, where the browser allows it). */
async function fullscreen(): Promise<void> {
  await toggleFullscreen().catch(() => undefined);
  const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
  if (TOUCH_DEVICE && document.fullscreenElement) await orientation.lock?.('landscape').catch(() => undefined);
}

/** Dev build: every level played is recorded (recording.ts) and saved to recordings/ by the dev server (vite.config.ts). */
const RECORD_FLUSH_MS = 10000;

function saveRecording(r: Recording): void {
  const name = `level${r.level}-${r.created.replace(/[:.]/g, '-')}`;
  fetch(`/__recording?name=${name}`, { method: 'POST', body: JSON.stringify(r) })
    .then((res) => console.log(res.ok ? `recorded recordings/${name}.json (${r.inputs.length} ticks)` : `recording not saved: ${res.status}`))
    .catch((e) => console.warn('recording not saved:', e));
}

const UPDATE_CHECK_MS = 4000; // how long a start waits for the server's sw.js before going on (offline, slow network)
const UPDATE_INSTALL_MS = 20000; // how long it waits for a new version to install
const UPDATE_INTERVAL_MS = 60 * 60 * 1000;

const within = <T>(promise: Promise<T>, ms: number) =>
  Promise.race([promise, new Promise<void>((resolve) => setTimeout(resolve, ms))]);

/**
 * The service worker (sw.js, written by the build) caches the game for the installed app and offline play.
 * Registered after the data has loaded, so its downloads don't slow the first start. Also asks to keep the
 * storage (saves, settings, cache) when the browser runs short of space.
 *
 * Updates: browsers look for a new sw.js only when a page is opened, and an installed app on a phone is mostly
 * resumed rather than restarted; the new version then took over in the background and only showed at the start
 * after that. So a start that already runs from the cache asks the server first and, if there is a new version,
 * waits for it and reloads ("Lade Update…"). The app also asks whenever it comes back to the screen and every hour;
 * `onUpdate` is called when a new version has taken over, and the caller reloads at a moment that loses nothing.
 */
async function registerOffline(base: string, status: HTMLElement, t: Strings, onUpdate: () => void): Promise<void> {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  navigator.storage?.persist?.().catch(() => undefined);
  const sw = navigator.serviceWorker;
  // The first install also takes over the page (clients.claim); only a change of controller is an update.
  let controlled = sw.controller !== null;
  let updated = false;
  const changed = new Promise<void>((resolve) => {
    sw.addEventListener('controllerchange', () => {
      if (controlled) {
        updated = true;
        resolve();
        onUpdate();
      }
      controlled = true;
    });
  });
  const reg = await sw.register(base + 'sw.js', { updateViaCache: 'none' }).catch((e) => {
    console.warn('no service worker:', e);
  });
  if (!reg) return;
  const check = () => reg.update().catch(() => undefined);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void check();
  });
  setInterval(() => void check(), UPDATE_INTERVAL_MS);
  if (!controlled) return; // the first visit: this page is the newest version
  await within(check(), UPDATE_CHECK_MS);
  if (!updated && !reg.installing && !reg.waiting) return;
  status.textContent = t.loadingUpdate;
  await within(changed, UPDATE_INSTALL_MS);
  if (updated) {
    location.reload();
    await new Promise(() => undefined); // the page is going away
  }
  status.textContent = t.loading;
}

async function main(): Promise<void> {
  const settings = loadSettings();
  const t = () => strings(settings.language);
  document.documentElement.lang = settings.language;
  const status = document.getElementById('status')!;
  status.textContent = t().loading;
  const base = import.meta.env.BASE_URL;
  const data = await loadGameData({
    json: async (name) => (await fetch(base + 'data/' + name)).json(),
    binary: async (name) => (await fetch(base + 'data/' + name)).arrayBuffer(),
  }).catch((e) => {
    status.textContent = t().loadFailed('game/public/data/');
    throw e;
  });
  useSpriteLanguage(data, settings.language);
  const sfx = await Sfx.load(base + 'data/').catch((e) => {
    console.warn('no sounds:', e);
    return undefined;
  });
  const music = new Music(base + 'music/');
  const video = new Video(base + 'video/');
  let game: Game | undefined = undefined;
  // A new version took over: reload where nothing is lost (the start screen, the intro, the main menu).
  let updateReady = false;
  const canReload = () =>
    game === undefined || game.atStart || game.atMainMenu || (game.view === 'video' && video.name === 'intro');
  await registerOffline(base, status, t(), () => {
    updateReady = true;
    if (canReload()) location.reload();
  });

  const view = await ClassicView.create(document.getElementById('app')!, data);
  const keys = new Keyboard(window);
  const mouse = new Mouse(view.element, (x, y) => view.toScreen(x, y));
  const pad = new Gamepad();
  // The installed app is fullscreen already (manifest); a second, element fullscreen would only add a way out to learn.
  let toggleRemaster = () => undefined as void; // set once the settings are loaded
  const touch = new TouchControls(
    document.body,
    TOUCH_DEVICE && !displayMode('fullscreen') ? () => void fullscreen() : undefined,
    TOUCH_DEVICE ? () => toggleRemaster() : undefined,
  );
  const layout = layoutCache(touch.cornerButtons);
  // For a touch (pointerup or touchend, not pointerdown, counts as the gesture that allows sound) or a key.
  const unlock = () => {
    sfx?.unlock();
    music.unlock();
  };
  for (const type of ['keydown', 'pointerdown', 'pointerup', 'touchend']) window.addEventListener(type, unlock);
  document.addEventListener('gesturestart', (e) => e.preventDefault()); // iOS pinch zoom

  let pauseTap = false; // the page was hidden during a level: pause it (one P press)
  const recorder = import.meta.env.DEV ? new Recorder(saveRecording) : null;
  const input: MenuInput = {
    held: (code) => keys.held(code) || touch.held(code) || (code === 'KeyP' && pauseTap),
    anyKey: () => keys.anyKey() || touch.anyKey(),
    mouse,
    get players() {
      const players = playerInputs(game!.settings.control, game!.world.players.map((p) => p.active), keys, mouse, pad, touch);
      // asked once per simulation tick, by the level only
      if (recorder && game!.view === 'world') recorder.input(game!.world, players, game!.settings.language);
      return players;
    },
  };
  const touchUsed = () => settings.control.includes(5);
  status.textContent = '';
  view.setArea(touchUsed() ? layout().game : null);
  touch.update(false, [], layout());
  // The start screen comes first (screens/start.ts); choosing a version there is the user gesture browsers want
  // before they play sound, so the intro's CD track starts with the intro.
  game = new Game(createWorld(data, Date.now() >>> 0), input, settings, sfx, music, saveSettings, saveSlot, video);
  document.addEventListener('visibilitychange', () => {
    sfx?.setHidden(document.hidden);
    music.setHidden(document.hidden);
    if (document.hidden && game!.view === 'world' && !game!.paused) pauseTap = true;
  });
  // A mouse player steers with the pointer captured (relative movement, as with the DOS driver); the
  // request needs a user gesture, so it is repeated on clicks during the level.
  const mousePlays = () =>
    game!.view === 'world' && game!.world.players.some((p) => p.active && game!.settings.control[p.index] === 2);
  view.element.addEventListener('pointerdown', () => {
    if (mousePlays()) mouse.lock();
  });
  if (import.meta.env.DEV) Object.assign(window, { game, view }); // for debugging in the browser console
  // The game keys below the picture (not with touch controls, which fill the window).
  const legend = document.getElementById('keys')!;
  const showKeys = () => {
    legend.hidden = TOUCH_DEVICE || touchUsed();
    const playing = game!.atStart ? 'start' : game!.view === 'video' ? video.name
      : game!.view === 'screen' && game!.screen.picture === 'UMBILD' ? 'hangar' : '';
    const text = keyLegend(settings.language, settings.control, game!.world.players.map((p) => p.active), playing).join('\n');
    if (legend.textContent !== text) legend.textContent = text;
    view.setBelow(legend.hidden ? 0 : legend.offsetHeight);
    legend.style.top = `${Math.round(view.picture.y + view.picture.h)}px`;
  };

  // R, the touch HD button and the Options line switch between the classic and the remastered graphics,
  // anywhere (menus, levels); the choice is a setting. The frame loop applies it.
  const remasterLabel = document.getElementById('remaster')!;
  let labelTimer = 0;
  const showRemaster = (text: string) => {
    remasterLabel.textContent = text;
    remasterLabel.hidden = false;
    clearTimeout(labelTimer);
    labelTimer = window.setTimeout(() => (remasterLabel.hidden = true), 2500);
  };
  toggleRemaster = () => {
    settings.remastered = !settings.remastered;
    saveSettings(settings);
    showRemaster(t().graphicsToast(settings.remastered));
  };

  let acc = 0;
  let last = performance.now();
  let mouseWasPlaying = false;
  let quitting = false;
  let flushed = 0;
  const frame = (now: number) => {
    acc += Math.min(now - last, TICK_MS * MAX_TICKS_PER_FRAME);
    last = now;
    if (keys.takePress('KeyF')) void toggleFullscreen();
    if (keys.takePress('KeyR')) toggleRemaster();
    const graphics = settings.remastered || game.atStart ? REMASTER_METHOD : null; // the start screen shows both
    view.element.style.cursor = game.atStart ? 'default' : 'none'; // the menus with a pointer draw their own
    if (view.hiRes.current !== graphics) void view.hiRes.use(graphics);
    while (acc >= TICK_MS) {
      keys.sample();
      mouse.sample();
      pad.sample();
      touch.sample();
      view.hiRes.beforeTick(game.view, game.world, game.screen);
      game.tick(input);
      view.hiRes.afterTick(game.view, game.world);
      pauseTap = false;
      acc -= TICK_MS;
    }
    if (recorder && game.view !== 'world') recorder.end();
    else if (recorder && now - flushed > RECORD_FLUSH_MS) {
      flushed = now;
      recorder.flush();
    }
    if (updateReady && canReload()) {
      location.reload();
      return;
    }
    if (game.quit !== quitting) {
      quitting = game.quit;
      // Exit in the main menu closes the installed app, as the original quit to DOS. A page may close its window
      // when it is the window's only history entry; where the browser refuses (iOS), the start screen follows.
      if (quitting && INSTALLED) window.close();
    }
    const touchPlays = game.view === 'world' && game.world.players.some((p) => p.active && settings.control[p.index] === 5);
    // The screens' buttons (pause, abort, paging, Ja/Nein, the hangar's cheat) only on a touch device or with
    // touch controls: the keyboard has the keys (the legend names them), and a mouse player's pointer is captured.
    const touchKeys = TOUCH_DEVICE || touchUsed() ? game.touchKeys : NO_KEYS;
    // The videos (intro, ending) have no remastered version: no HD button over them.
    touch.setLanguage(settings.language);
    useSpriteLanguage(data, settings.language); // the menu items and the shop panel
    document.documentElement.lang = settings.language;
    touch.update(touchPlays, touchKeys, layout(), settings.remastered, game.view !== 'video');
    view.setArea(touchUsed() ? layout().game : null);
    showKeys();
    if (mousePlays() !== mouseWasPlaying) {
      mouseWasPlaying = !mouseWasPlaying;
      if (mouseWasPlaying) mouse.lock();
      else mouse.unlock();
    }
    const alpha = acc / TICK_MS; // how far this frame lies between the last tick and the next
    if (game.view === 'screen' && game.screen.picture === 'UMBILD') view.hiRes.prefetch(game.world.level); // the hangar
    if (game.view === 'world') view.draw(game.world, alpha);
    else if (game.view === 'video') view.drawVideo(video.element);
    else view.drawScreen(game.screen, alpha);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

main();
