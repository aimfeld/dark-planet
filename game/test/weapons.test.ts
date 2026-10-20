import { describe, expect, it } from 'vitest';
import { spawnEnemy } from '../src/sim/enemies';
import { centerX, centerY } from '../src/sim/sprites';
import { createWorld, NO_INPUT, type PlayerInput, type World } from '../src/sim/state';
import { newGame, startLevel, step } from '../src/sim/tick';
import { cosDeg, round, sinDeg } from '../src/sim/tp';
import { gameData, hasData } from './helpers';

const FIRE: PlayerInput = { ...NO_INPUT, fire: true };

/** Level 1 with jet 5 (Alien-Pro 2) and only the given pods; no scrolling, so nothing spawns or moves. */
async function world(pods: [mount: number, cat: number, item: number][]): Promise<World> {
  const w = createWorld(await gameData(), 7);
  newGame(w);
  const p = w.players[0];
  p.jet = 5;
  for (const m of p.mounts) m.occupied = false;
  for (const [mount, cat, item] of pods) p.mounts[mount] = { reload: 0, loaded: true, occupied: true, item, cat };
  startLevel(w, 1);
  w.scrolling = false;
  return w;
}

const shots = (w: World) => w.players[0].shots.filter((s) => s.active);

/** Enemy type 1 (air, reward 200, energy 20) standing still (sub 0); returns its record index. */
function enemyAt(w: World, x: number, bottom: number): number {
  spawnEnemy(w, x, bottom, 1, 0);
  return w.enemies.findIndex((e, i) => i > 0 && e.active);
}

describe.skipIf(!hasData)('remaining weapons (spec §4.3, §4.5)', () => {
  it('Autogun: drops its shots without a target, else flies a line at the nearest enemy centre', async () => {
    const w = await world([[1, 1, 4]]);
    const p = w.players[0];
    step(w, [FIRE]);
    expect(shots(w)).toHaveLength(0);
    expect(p.mounts[1].reload).toBe(4); // the volley still counts: unloaded, then reloaded with the interval

    const w2 = await world([[1, 1, 4]]);
    const e = w2.enemies[enemyAt(w2, 90, w2.scrollY + 40)];
    step(w2, [FIRE]);
    const [a, b] = shots(w2);
    expect(a.pattern).toBe(7);
    expect([a.tx, a.ty]).toEqual([centerX(w2, e.slot), centerY(w2, e.slot)]);
    expect(w2.sounds.some((s) => s.n === 2)).toBe(true); // spec §12 #4: the remake plays MINIPOD
    // y is the major axis here (the target is further up than to the side): y steps by 15, x follows the line
    const y0 = w2.spr.y[a.slot];
    step(w2, [NO_INPUT]);
    expect(w2.spr.y[a.slot]).toBe(y0 - 15);
    expect(w2.spr.x[a.slot]).toBe(a.sx + round(((a.tx - a.sx) * Math.abs(w2.spr.y[a.slot] - a.sy)) / Math.abs(a.ty - a.sy)));
    expect(b.active).toBe(true);
  });

  it('Flamer: the flame animates, follows the pod and burns out after 18 ticks', async () => {
    const w = await world([[3, 2, 1]]);
    const p = w.players[0];
    step(w, [FIRE]);
    const [f] = shots(w);
    expect(f.pattern).toBe(9);
    const pod = p.slots.pods + 3;
    for (let t = 0; t < 4; t++) step(w, [{ ...NO_INPUT, right: true }]);
    expect(w.spr.x[f.slot] - w.spr.x[pod]).toBe(-39);
    expect(w.spr.y[f.slot] - w.spr.y[pod]).toBe(-64);
    expect(w.spr.x[f.slot]).toBeGreaterThan(f.sx); // the jet moved right, the flame with it
    expect(w.spr.n[f.slot]).toBeGreaterThan(157); // anim 5: frames 157-166
    for (let t = 5; t < 18; t++) step(w, [NO_INPUT]);
    expect(f.active).toBe(true);
    step(w, [NO_INPUT]);
    expect(f.active).toBe(false);
  });

  it('G-Destructor: 10 shots jitter 7 px sideways and rise 4-9 px every tick', async () => {
    const w = await world([[3, 2, 11]]);
    step(w, [FIRE]);
    const list = shots(w);
    expect(list).toHaveLength(10);
    const before = list.map((s) => [w.spr.x[s.slot], w.spr.y[s.slot]]);
    step(w, [NO_INPUT]);
    list.forEach((s, i) => {
      expect(Math.abs(w.spr.x[s.slot] - before[i][0])).toBe(7);
      expect(before[i][1] - w.spr.y[s.slot]).toBeGreaterThanOrEqual(4);
      expect(before[i][1] - w.spr.y[s.slot]).toBeLessThanOrEqual(9);
    });
  });

  it('ball pod: orbits at radius 40, k degrees per tick', async () => {
    const w = await world([[7, 6, 2]]); // Teutonenkopf, k = 7
    const p = w.players[0];
    for (let t = 0; t < 30; t++) step(w, [NO_INPUT]);
    const jet = p.slots.jet, ball = p.slots.pods + 7;
    const e = w.data.tables.jets[4].extents;
    const cx = e.l + ((e.r - e.l) >> 1);
    expect(w.spr.n[ball]).toBe(100);
    expect(w.spr.x[ball]).toBe(cx + w.spr.x[jet] - 6 + round(40 * cosDeg(7 * w.frame)));
    expect(w.spr.y[ball]).toBe((e.b >> 1) + w.spr.y[jet] - 6 - round(40 * sinDeg(7 * w.frame)));
  });

  it('ball pod: destroys enemy shots and damages enemies on contact, for P2 too (spec §12 #3)', async () => {
    const w = await world([[7, 6, 1]]); // Smiley 2, 15 per tick
    const p = w.players[0];
    step(w, [NO_INPUT]);
    const ball = p.slots.pods + 7;
    const top = w.spr.y[ball] - 5;
    const e = w.enemies[enemyAt(w, w.spr.x[ball] - 5, top + w.data.sprites.get(850)!.h)];
    const life = p.life;
    const energy = e.energy;
    // freeze the orbit by holding the frame counter, so the ball stays on the enemy
    const f = w.frame;
    w.frame = f - 1;
    step(w, [NO_INPUT]);
    expect(e.energy).toBe(energy - 15);
    w.frame = f - 1;
    step(w, [NO_INPUT]);
    expect(e.active).toBe(false); // 20 energy: dead after the 2nd contact
    expect(p.money).toBe(200);
    expect(p.life).toBe(life); // not a ramming kill
  });

  it('Distroyer reloads every 10 ticks (spec §12 #2)', async () => {
    const w = await world([[7, 6, 3]]);
    const volleys: number[] = [];
    for (let t = 1; t <= 40; t++) {
      step(w, [FIRE]);
      if (shots(w).some((s) => s.age === 1)) volleys.push(t);
    }
    expect(volleys).toEqual([1, 2, 12, 22, 32]); // the counter starts at 0, so the 2nd volley comes at once
  });
});
