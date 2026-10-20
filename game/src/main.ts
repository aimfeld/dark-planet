// Boot: load the data, run the fixed 40 Hz game loop (menus, levels) and draw the classic view.

import { Music } from './audio/music';
import { Sfx } from './audio/sfx';
import { loadGameData } from './data';
import { DEFAULT_SETTINGS, Game } from './game';
import { Keyboard } from './input/keyboard';
import { keyboardLockSupported, toggleFullscreen } from './input/fullscreen';
import { Mouse } from './input/mouse';
import { ClassicView } from './render/classicView';
import type { MenuInput, SaveSlot, Settings } from './screens/proc';
import { createWorld, NO_INPUT } from './sim/state';

const TICK_MS = 1000 / 40; // decision (user, session 3): fixed 40 Hz, 1 tick = 1 original frame
const MAX_TICKS_PER_FRAME = 8; // after a stall, catch up at most this much instead of spiralling
const SETTINGS_KEY = 'darkplanet.settings'; // SETTINGS.DAT
const SAVE_KEY = 'darkplanet.save'; // SAVE.DAT, base64

function loadSettings(): Settings {
  const s = structuredClone(DEFAULT_SETTINGS);
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

  const view = await ClassicView.create(document.getElementById('app')!, data);
  const keys = new Keyboard(window);
  const mouse = new Mouse(view.element, (x, y) => view.toScreen(x, y));
  const unlock = () => {
    sfx?.unlock();
    music.unlock();
  };
  window.addEventListener('keydown', unlock);
  window.addEventListener('pointerdown', unlock);

  const input: MenuInput = {
    held: (code) => keys.held(code),
    anyKey: () => keys.anyKey(),
    mouse,
    // P1 on the keyboard; mouse and gamepad steering come with the two-player input
    get players() {
      return [keys.player(), NO_INPUT];
    },
  };
  const game = new Game(createWorld(data, Date.now() >>> 0), input, loadSettings(), sfx, music, saveSettings, saveSlot);
  status.textContent = keyboardLockSupported() ? '' : 'F: Vollbild (ohne Tastatursperre)';

  let acc = 0;
  let last = performance.now();
  const frame = (now: number) => {
    acc += Math.min(now - last, TICK_MS * MAX_TICKS_PER_FRAME);
    last = now;
    if (keys.takePress('KeyF')) void toggleFullscreen();
    while (acc >= TICK_MS) {
      keys.sample();
      mouse.sample();
      game.tick(input);
      acc -= TICK_MS;
    }
    if (game.view === 'world') view.draw(game.world);
    else view.drawScreen(game.screen);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

main();
