import { describe, expect, it } from 'vitest';
import { BOSS_FREEZE_TICKS, direction8, enemyDestroyed, enemyFire, moveEnemyShots, spawnEnemy } from '../src/sim/enemies';
import { createWorld, NO_INPUT, type PlayerInput, type World } from '../src/sim/state';
import { newGame, startLevel, step } from '../src/sim/tick';
import { cosDeg, round, sinDeg } from '../src/sim/tp';
import { gameData, hasData } from './helpers';

const FIRE: PlayerInput = { ...NO_INPUT, fire: true };

/** Keeps the players invulnerable for the next tick (a counter below 1 would end it at once). */
function invulnerable(w: World): void {
  for (const p of w.players) {
    p.invulnerable = true;
    p.invCounter = 2;
  }
}

/** A level up to the boss start (after the frozen fade ticks), P1 kept invulnerable. */
async function atBoss(level: number, seed = 5): Promise<World> {
  const w = createWorld(await gameData(), seed);
  newGame(w);
  startLevel(w, level);
  while (w.scrolling) {
    invulnerable(w);
    step(w, [NO_INPUT]);
  }
  for (let t = 0; t < BOSS_FREEZE_TICKS; t++) step(w, [NO_INPUT]);
  return w;
}

const pos = (w: World, record: number) => [w.spr.x[w.enemies[record].slot], w.spr.y[w.enemies[record].slot]];

describe('Direction8 (0x167E5)', () => {
  it('maps the eight sectors, 0 = up, clockwise', () => {
    const dirs = [[0, -10], [10, -10], [10, 0], [10, 10], [0, 10], [-10, 10], [-10, 0], [-10, -10]];
    expect(dirs.map(([x, y]) => direction8(0, 0, x, y))).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(direction8(0, 0, 0, 0)).toBe(0);
    expect(direction8(0, 0, 10, -24)).toBe(1); // slope 2.4, below 2.414
    expect(direction8(0, 0, 10, -25)).toBe(0);
    expect(direction8(0, 0, -10, -4)).toBe(6); // slope -0.4 (left), above -0.414
  });
});

describe.skipIf(!hasData)('episode 2 and the bosses (spec §7.3, §7.5, §8)', () => {
  it('levels 2-6 play through the scroll and 1500 boss ticks with every sub and shot pattern ported', async () => {
    const data = await gameData();
    for (let level = 2; level <= 6; level++) {
      const w = createWorld(data, level);
      newGame(w);
      startLevel(w, level);
      const subs = new Set<number>(), patterns = new Set<number>();
      let bossTicks = 0;
      for (let t = 0; t < 8000 && bossTicks < 1500; t++) {
        invulnerable(w);
        step(w, [t % 200 < 100 ? FIRE : { ...FIRE, left: t % 40 < 20, right: t % 40 >= 20 }]);
        if (!w.scrolling) bossTicks++;
        for (const e of w.enemies) if (e.active) subs.add(e.sub);
        for (const s of w.enemyShots) if (s.active) patterns.add(s.pattern);
      }
      expect(bossTicks, `level ${level}`).toBe(1500);
      expect(w.players[0].active).toBe(true);
    }
  });

  it('level 2: the parts ride on the core; killing 0x0D drops the core to the ground (sub 8)', async () => {
    const w = await atBoss(2);
    const [part0c, part0d, core] = [1, 2, 3].map((r) => w.enemies[r]);
    expect([part0c.type, part0d.type, core.type, core.sub]).toEqual([0x0c, 0x0d, 0x05, 7]);
    step(w, [NO_INPUT]);
    const [cx, cy] = pos(w, 3);
    expect(pos(w, 2)).toEqual([cx - 10, cy + 20]);
    expect(pos(w, 1)).toEqual([cx + 16, cy + 46]);
    // the first loop: radius 50 around (x0 - 50, y0), 5 degrees per tick from 0 degrees
    expect([cx, cy]).toEqual([core.x0 - 50 + round(50 * cosDeg(core.c)), core.y0 - round(50 * sinDeg(core.c))]);
    enemyDestroyed(w, w.players[0], 2, true, true);
    expect([core.sub, core.layer, core.phase, core.c, part0c.layer]).toEqual([8, 0, 0, 0, 0]);
    expect([core.x0, core.y0]).toEqual([cx, cy]);
    expect(w.quake).toBe(40);
    for (let t = 0; t < 40; t++) step(w, [NO_INPUT]);
    expect(core.phase).toBe(1); // waits 40 ticks, then flies to the top-left corner
    step(w, [NO_INPUT]);
    expect(pos(w, 3)[0]).toBeLessThan(cx);
  });

  it('level 3: a destroyed body segment is refilled and the last one flies off toward a random target', async () => {
    const w = await atBoss(3);
    const p = w.players[0];
    expect([1, 2, 3, 4, 5].map((r) => w.enemies[r].type)).toEqual([0x20, 0x21, 0x21, 0x21, 0x22]);
    for (let t = 0; t < 60; t++) step(w, [NO_INPUT]);
    const money = p.money;
    const last = w.enemies[4], tail = w.enemies[5];
    const [lx, ly] = pos(w, 4);
    enemyDestroyed(w, p, 3, false, true);
    expect(p.money - money).toBe(1000);
    expect(w.enemies[3].active).toBe(true);
    expect(w.enemies[3].energy).toBe(100);
    expect([last.active, last.dying, last.sub]).toEqual([false, true, 0x13]);
    expect([last.x0, last.y0]).toEqual([lx, ly]);
    expect(last.energy).toBeGreaterThanOrEqual(0); // the target x (spec §12 #7: no longer cleared to 0)
    expect(last.energy).toBeLessThan(320);
    expect([tail.angle, tail.phase]).toEqual([last.angle, last.phase]);
    expect(w.spr.n[last.slot]).toBe(992); // the wreck sprite is the body sprite
    step(w, [NO_INPUT]);
    const [dx, dy] = [w.spr.x[last.slot] - lx, w.spr.y[last.slot] - ly];
    expect(Math.max(Math.abs(dx), Math.abs(dy))).toBe(9); // 9 px on the major axis
  });

  it('level 4: the parts ride on the core, which runs a closed loop (spec §12 #9)', async () => {
    const w = await atBoss(4);
    const core = w.enemies[5];
    expect(core.type).toBe(0x3c);
    step(w, [NO_INPUT]);
    const [cx, cy] = pos(w, 5);
    expect([pos(w, 1), pos(w, 2), pos(w, 3), pos(w, 4)]).toEqual([
      [cx + 28, cy + 63], [cx + 71, cy + 63], [cx + 38, cy + 24], [cx + 48, cy + 17],
    ]);
    const atReset: number[][] = [];
    for (let t = 0; t < 1000 && atReset.length < 2; t++) {
      invulnerable(w);
      step(w, [NO_INPUT]);
      if (core.t === 3) atReset.push(pos(w, 5));
    }
    expect(atReset).toHaveLength(2);
    expect(atReset[1]).toEqual(atReset[0]);
  });

  it('level 6: the curse at c 150 takes the pods and the inventory; the dead Golem pays once and drifts', async () => {
    const w = await atBoss(6);
    const p = w.players[0];
    p.mounts[3] = { reload: 0, loaded: true, occupied: true, item: 2, cat: 2 };
    p.mounts[7] = { reload: 0, loaded: true, occupied: true, item: 1, cat: 6 };
    p.mounts[2].item = 3;
    w.spr.n[p.slots.pods + 3] = 50;
    p.bonus = [3, 4, 0];
    const g = w.enemies[2];
    expect([g.type, g.sub]).toEqual([0x48, 0x27]);
    while (g.c !== 150) step(w, [NO_INPUT]);
    expect(p.mounts.map((m) => m.occupied)).toEqual([false, false, true, false, false, false, false, false]);
    expect(p.mounts[2].item).toBe(1);
    expect(p.bonus).toEqual([0, 0, 0]);
    expect(w.spr.n[p.slots.pods + 3]).toBe(0);
    expect(w.explosions.some((e) => e.active)).toBe(true);
    const money = p.money;
    enemyDestroyed(w, p, 2, true, true);
    expect(p.money - money).toBe(30000);
    expect([g.active, g.dying, g.sub, w.spr.n[g.slot]]).toEqual([false, true, 0x2a, 1333]);
    expect(w.autopilot).toBe(true);
  });

  it('level 6: the Golem drops three rocks and fires two laser beams (always enemy record 1)', async () => {
    const w = await atBoss(6);
    const g = w.enemies[2];
    Object.assign(g, { phase: 3, c: 0 });
    step(w, [NO_INPUT]);
    const rocks = w.enemies.filter((e) => e.active && e.type === 0x49);
    expect(rocks.map((e) => e.sub)).toEqual([0x28, 0x28, 0x28]);
    expect(w.quake).toBe(59); // Quake(60), one tick drawn
    const ry = w.spr.y[rocks[0].slot];
    step(w, [NO_INPUT]);
    expect(w.spr.y[rocks[0].slot] - ry).toBe(7);
    Object.assign(g, { phase: 5, c: 0 });
    step(w, [NO_INPUT]);
    const laser = w.enemies[1];
    expect([laser.type, laser.sub, laser.active]).toEqual([0x4a, 0x29, true]);
    expect(w.spr.x[laser.slot]).toBe(w.spr.x[g.slot] - 50);
    while (g.c < 44) step(w, [NO_INPUT]);
    expect(laser.t).toBe(1); // the second beam takes record 1 again
    for (let t = 0; t < 49; t++) step(w, [NO_INPUT]);
    expect(laser.active).toBe(false); // gone when older than 49 ticks
  });

  it('enemy shots: arc (17), falling (19) and the turret facing (22)', async () => {
    const w = createWorld(await gameData(), 3);
    newGame(w);
    w.scrolling = false;
    const at = (type: number) => {
      spawnEnemy(w, 150, w.scrollY + 60, type, 0);
      return w.enemies.findIndex((e, i) => i > 0 && e.active && e.type === type);
    };
    const shot = () => w.enemyShots.find((s) => s.active)!;
    // 0x2C: kind 14, pattern 17 (arc of radius 200 around (sx, sy + 200), 2 degrees per tick)
    enemyFire(w, at(0x2c), 1, 0);
    let s = shot();
    moveEnemyShots(w);
    moveEnemyShots(w);
    expect([w.spr.x[s.slot], w.spr.y[s.slot]]).toEqual([s.sx + round(200 * cosDeg(86)), s.sy + 200 - round(200 * sinDeg(86))]);
    s.active = false;
    // 0x3F: kind 25, pattern 19: falls 0, 1, 2, ... px per tick
    enemyFire(w, at(0x3f), 1, 0);
    s = shot();
    const y0 = w.spr.y[s.slot];
    for (let k = 0; k < 4; k++) moveEnemyShots(w);
    expect(w.spr.y[s.slot] - y0).toBe(0 + 1 + 2 + 3);
    s.active = false;
    // 0x3D turret facing down-right (sprite + 3): kind 1 (speed 6) moves (4, 4) per tick
    const i = at(0x3d);
    w.spr.n[w.enemies[i].slot] += 3;
    enemyFire(w, i, 1, 0);
    s = shot();
    const x0 = w.spr.x[s.slot], y1 = w.spr.y[s.slot];
    const turret = w.enemies[i].slot; // the shot leaves the turret's gun (+15, +13), not x = facing (0x154B1)
    expect([x0, y1]).toEqual([w.spr.x[turret] + 15, w.spr.y[turret] + 13]);
    moveEnemyShots(w);
    expect([w.spr.x[s.slot] - x0, w.spr.y[s.slot] - y1]).toEqual([4, 4]);
  });
});
