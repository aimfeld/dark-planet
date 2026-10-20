// Boot: load the data, run the fixed 40 Hz game loop (menus, levels) and draw the classic view.

import { Music } from './audio/music';
import { Sfx } from './audio/sfx';
import { loadGameData } from './data';
import { DEFAULT_SETTINGS, Game, INTRO_TRACK } from './game';
import { Keyboard } from './input/keyboard';
import { toggleFullscreen } from './input/fullscreen';
import { Gamepad } from './input/gamepad';
import { keyLegend } from './input/keyLegend';
import { Mouse } from './input/mouse';
import { playerInputs } from './input/players';
import { TouchControls, touchLayout, type Insets, type TouchLayout } from './input/touch';
import { ClassicView } from './render/classicView';
import { REMASTER_METHODS, type RemasterMethod } from './render/hiResView';
import type { MenuInput, SaveSlot, Settings } from './screens/proc';
import { createWorld } from './sim/state';
import { Video } from './video';

const TICK_MS = 1000 / 40; // decision (user, session 3): fixed 40 Hz, 1 tick = 1 original frame
const MAX_TICKS_PER_FRAME = 8; // after a stall, catch up at most this much instead of spiralling
const SETTINGS_KEY = 'darkplanet.settings'; // SETTINGS.DAT
const SAVE_KEY = 'darkplanet.save'; // SAVE.DAT, base64
/** A phone or tablet: the primary pointer is a finger. */
const TOUCH_DEVICE = window.matchMedia('(pointer: coarse)').matches;
const displayMode = (mode: string) => window.matchMedia(`(display-mode: ${mode})`).matches;
/** Started as the installed app (PWA), not in a browser tab; iOS reports it as navigator.standalone. */
const INSTALLED =
  ['fullscreen', 'standalone', 'minimal-ui'].some(displayMode) || (navigator as Navigator & { standalone?: boolean }).standalone === true;

function loadSettings(): Settings {
  const s = structuredClone(DEFAULT_SETTINGS);
  if (TOUCH_DEVICE) s.control = [5, 1]; // P1 touch (P2 the keyboard, for a tablet with one)
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
function layoutCache(): () => TouchLayout {
  let key = '';
  let layout: TouchLayout;
  return () => {
    const k = `${window.innerWidth}x${window.innerHeight}`;
    if (k !== key) {
      key = k;
      layout = touchLayout(window.innerWidth, window.innerHeight, safeInsets());
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
async function registerOffline(base: string, status: HTMLElement, onUpdate: () => void): Promise<void> {
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
  status.textContent = 'Lade Update…';
  await within(changed, UPDATE_INSTALL_MS);
  if (updated) {
    location.reload();
    await new Promise(() => undefined); // the page is going away
  }
  status.textContent = 'Lade Daten…';
}

async function main(): Promise<void> {
  const status = document.getElementById('status')!;
  status.textContent = 'Lade Daten…';
  const base = import.meta.env.BASE_URL;
  const data = await loadGameData({
    json: async (name) => (await fetch(base + 'data/' + name)).json(),
    binary: async (name) => (await fetch(base + 'data/' + name)).arrayBuffer(),
  }).catch((e) => {
    status.textContent = 'Daten konnten nicht geladen werden (game/public/data/)';
    throw e;
  });
  const sfx = await Sfx.load(base + 'data/').catch((e) => {
    console.warn('no sounds:', e);
    return undefined;
  });
  const music = new Music(base + 'music/');
  const video = new Video(base + 'video/');
  let game: Game | undefined = undefined;
  // A new version took over: reload where nothing is lost (the start prompt, the intro, the main menu).
  let updateReady = false;
  const canReload = () =>
    game === undefined || game.atMainMenu || (game.view === 'video' && video.name === 'intro');
  await registerOffline(base, status, () => {
    updateReady = true;
    if (canReload()) location.reload();
  });

  const view = await ClassicView.create(document.getElementById('app')!, data);
  const keys = new Keyboard(window);
  const mouse = new Mouse(view.element, (x, y) => view.toScreen(x, y));
  const pad = new Gamepad();
  // The installed app is fullscreen already (manifest); a second, element fullscreen would only add a way out to learn.
  const touch = new TouchControls(document.body, TOUCH_DEVICE && !displayMode('fullscreen') ? () => void fullscreen() : undefined);
  const layout = layoutCache();
  // For a touch (pointerup or touchend, not pointerdown, counts as the gesture that allows sound) or a key.
  const unlock = () => {
    sfx?.unlock();
    music.unlock();
  };
  for (const type of ['keydown', 'pointerdown', 'pointerup', 'touchend']) window.addEventListener(type, unlock);
  document.addEventListener('gesturestart', (e) => e.preventDefault()); // iOS pinch zoom

  let pauseTap = false; // the page was hidden during a level: pause it (one P press)
  const input: MenuInput = {
    held: (code) => keys.held(code) || touch.held(code) || (code === 'KeyP' && pauseTap),
    anyKey: () => keys.anyKey() || touch.anyKey(),
    mouse,
    get players() {
      return playerInputs(game!.settings.control, game!.world.players.map((p) => p.active), keys, mouse, pad, touch);
    },
  };
  const settings = loadSettings();
  const touchUsed = () => settings.control.includes(5);
  status.textContent = '';
  view.setArea(touchUsed() ? layout().game : null);
  touch.update(false, [], layout());
  // Browsers may refuse sound before a user gesture. Where they allow it, the intro starts at once, as with
  // DPMAX.BAT; otherwise it waits for a key or tap, since the first key would both start its CD track and skip it.
  music.setEnabled(settings.cdSound);
  music.play(INTRO_TRACK);
  if (await music.refused()) {
    const prompt = document.getElementById('start')!;
    if (TOUCH_DEVICE) prompt.textContent = 'Dark Planet: Tippen zum Starten';
    prompt.hidden = false;
    await new Promise<void>((resolve) => {
      const start = () => {
        window.removeEventListener('keydown', start);
        window.removeEventListener('pointerup', start);
        resolve();
      };
      window.addEventListener('keydown', start);
      window.addEventListener('pointerup', start);
    });
    prompt.hidden = true;
  }
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
    const playing = game!.view === 'video' ? video.name : '';
    const text = keyLegend(settings.control, game!.world.players.map((p) => p.active), playing).join('\n');
    if (legend.textContent !== text) legend.textContent = text;
    view.setBelow(legend.hidden ? 0 : legend.offsetHeight);
    legend.style.top = `${Math.round(view.picture.y + view.picture.h)}px`;
  };

  // G switches between the classic and the remastered graphics, anywhere (menus, levels), remembered.
  const remasterLabel = document.getElementById('remaster')!;
  let labelTimer = 0;
  const showRemaster = (text: string) => {
    remasterLabel.textContent = text;
    remasterLabel.hidden = false;
    clearTimeout(labelTimer);
    labelTimer = window.setTimeout(() => (remasterLabel.hidden = true), 2500);
  };
  const remasterKey = 'dark-planet-remaster';
  const storedMethod = (() => {
    try {
      return localStorage.getItem(remasterKey);
    } catch {
      return null;
    }
  })();
  const useMethod = (m: RemasterMethod | null) => {
    void view.hiRes.use(m);
    try {
      localStorage.setItem(remasterKey, m ?? '');
    } catch {
      // no storage: the choice lasts until the page reloads
    }
  };
  if (REMASTER_METHODS.includes(storedMethod as RemasterMethod)) useMethod(storedMethod as RemasterMethod);

  let acc = 0;
  let last = performance.now();
  let mouseWasPlaying = false;
  let quitting = false;
  const frame = (now: number) => {
    acc += Math.min(now - last, TICK_MS * MAX_TICKS_PER_FRAME);
    last = now;
    if (keys.takePress('KeyF')) void toggleFullscreen();
    if (keys.takePress('KeyG')) {
      const order = [null, ...REMASTER_METHODS];
      const next = order[(order.indexOf(view.hiRes.current) + 1) % order.length];
      useMethod(next);
      showRemaster(next ? 'Grafik: Remastered' : 'Grafik: Classic');
    }
    while (acc >= TICK_MS) {
      keys.sample();
      mouse.sample();
      pad.sample();
      touch.sample();
      view.hiRes.beforeTick(game.view, game.world, game.screen);
      game.tick(input);
      pauseTap = false;
      acc -= TICK_MS;
    }
    if (updateReady && canReload()) {
      location.reload();
      return;
    }
    if (game.quit !== quitting) {
      quitting = game.quit;
      // Exit in the main menu closes the installed app, as the original quit to DOS. A page may close its window
      // when it is the window's only history entry; where the browser refuses (iOS), the game waits for a key.
      if (quitting && INSTALLED) window.close();
    }
    const touchPlays = game.view === 'world' && game.world.players.some((p) => p.active && settings.control[p.index] === 5);
    touch.update(touchPlays, game.touchKeys, layout());
    view.setArea(touchUsed() ? layout().game : null);
    showKeys();
    if (mousePlays() !== mouseWasPlaying) {
      mouseWasPlaying = !mouseWasPlaying;
      if (mouseWasPlaying) mouse.lock();
      else mouse.unlock();
    }
    const alpha = acc / TICK_MS; // how far this frame lies between the last tick and the next
    if (game.view === 'world') view.draw(game.world, alpha);
    else if (game.view === 'video') view.drawVideo(video.element);
    else view.drawScreen(game.screen, alpha);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

main();
