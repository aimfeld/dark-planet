// Boot: load the data, run the fixed 40 Hz game loop (menu placeholder, levels) and draw the classic view.

import { Sfx } from './audio/sfx';
import { loadGameData } from './data';
import { Game } from './game';
import { Keyboard } from './input/keyboard';
import { keyboardLockSupported, toggleFullscreen } from './input/fullscreen';
import { ClassicView } from './render/classicView';
import { createWorld } from './sim/state';

const TICK_MS = 1000 / 40; // decision (user, session 3): fixed 40 Hz, 1 tick = 1 original frame
const MAX_TICKS_PER_FRAME = 8; // after a stall, catch up at most this much instead of spiralling

async function main(): Promise<void> {
  const status = document.getElementById('status')!;
  status.textContent = 'Lade Daten…';
  const base = import.meta.env.BASE_URL + 'data/';
  const data = await loadGameData({
    json: async (name) => (await fetch(base + name)).json(),
    binary: async (name) => (await fetch(base + name)).arrayBuffer(),
  }).catch((e) => {
    status.textContent = 'Daten konnten nicht geladen werden (game/public/data/)';
    throw e;
  });
  const sfx = await Sfx.load(base).catch((e) => {
    console.warn('no sounds:', e);
    return undefined;
  });

  const game = new Game(createWorld(data, Date.now() >>> 0), sfx);
  const view = await ClassicView.create(document.getElementById('app')!, data);
  const keys = new Keyboard(window);
  window.addEventListener('keydown', () => sfx?.unlock());

  let acc = 0;
  let last = performance.now();
  let shown = 0;
  const frame = (now: number) => {
    acc += Math.min(now - last, TICK_MS * MAX_TICKS_PER_FRAME);
    last = now;
    if (keys.takePress('KeyF')) void toggleFullscreen();
    if (keys.takePress('KeyP') && game.screen === 'level') game.paused = !game.paused;
    while (acc >= TICK_MS) {
      game.tick({ input: keys.player(), enter: keys.takePress('Enter'), escape: keys.takePress('Escape') });
      acc -= TICK_MS;
    }
    if (game.screen === 'level' || game.screen === 'fadeout') view.draw(game.world);
    else view.drawScreen(game.screenText());
    if (now - shown > 250) {
      shown = now;
      const w = game.world;
      const p = w.players[0];
      status.textContent = game.screen !== 'level' ? (keyboardLockSupported() ? '' : 'F: Vollbild (ohne Tastatursperre)') :
        `${game.paused ? 'PAUSE  ' : ''}tick ${w.frame}  scrollY ${w.scrollY}  ` +
        `life ${p.life} shield ${p.shield} lives ${p.lives} $${p.money}  ` +
        `enemies ${w.enemies.filter((e) => e.active).length}`;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

main();
