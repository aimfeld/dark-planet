// Boot: load the data, start a new game, run the fixed 40 Hz simulation and draw the classic view.

import { loadGameData } from './data';
import { Keyboard } from './input/keyboard';
import { ClassicView } from './render/classicView';
import { createWorld } from './sim/state';
import { newGame, step } from './sim/tick';

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
    status.textContent = 'game/public/data/ fehlt: npm run data (siehe README)';
    throw e;
  });

  const world = createWorld(data, Date.now() >>> 0);
  newGame(world);
  const view = await ClassicView.create(document.getElementById('app')!, data);
  const keys = new Keyboard(window);

  let paused = false;
  let acc = 0;
  let last = performance.now();
  let shown = 0;
  const frame = (now: number) => {
    acc += Math.min(now - last, TICK_MS * MAX_TICKS_PER_FRAME);
    last = now;
    if (keys.takePress('KeyP')) paused = !paused;
    if (keys.takePress('Escape')) {
      newGame(world);
      acc = 0;
    }
    if (paused) acc = 0;
    while (acc >= TICK_MS) {
      step(world, [keys.player()]);
      acc -= TICK_MS;
    }
    view.draw(world);
    if (now - shown > 250) {
      shown = now;
      const p = world.players[0];
      status.textContent = `${paused ? 'PAUSE  ' : ''}tick ${world.frame}  scrollY ${world.scrollY}  ` +
        `life ${p.life} shield ${p.shield} lives ${p.lives} $${p.money}  ` +
        `enemies ${world.enemies.filter((e) => e.active).length}`;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

main();
