import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Sprite, type GameData } from '../src/data';
import { Framebuffer, H, W } from '../src/render/framebuffer';
import { hitDetect } from '../src/sim/sprites';
import { createWorld, NO_INPUT, type PlayerInput, type World } from '../src/sim/state';
import { newGame, step } from '../src/sim/tick';
import { bmp, gameData, hasData } from './helpers';

function sprite(rows: string[]): Sprite {
  const h = rows.length, w = rows[0].length;
  const px = new Uint8Array(w * h);
  rows.forEach((r, y) => [...r].forEach((c, x) => (px[y * w + x] = c === '#' ? 1 : 0)));
  return new Sprite(w, h, px);
}

describe('HitDetect (AniVGA 28be:29B9)', () => {
  const sprites = new Map<number, Sprite>([
    [1, sprite(['#...', '#...', '#...', '####'])], // L shape, empty top-right corner
    [2, sprite(['##', '##'])],
  ]);
  const w = createWorld({ sprites } as unknown as GameData);
  const place = (slot: number, n: number, x: number, y: number) => {
    w.spr.n[slot] = n;
    w.spr.x[slot] = x;
    w.spr.y[slot] = y;
  };

  it('hits on overlapping opaque pixels', () => {
    place(10, 1, 0, 0);
    place(11, 2, -1, 2);
    expect(hitDetect(w, 10, 11)).toBe(true);
  });

  it('misses outside the bounding boxes and on the same slot', () => {
    place(10, 1, 0, 0);
    place(11, 2, 4, 0);
    expect(hitDetect(w, 10, 11)).toBe(false);
    expect(hitDetect(w, 10, 10)).toBe(false);
  });

  it('is not pixel-exact: the row and the column tests need not meet in one pixel', () => {
    // A ring and a dot in its hole: row 1 spans x 0..2 and column 1 spans y 0..2, both cover the dot.
    sprites.set(3, sprite(['.#.', '#.#', '.#.']));
    sprites.set(4, sprite(['#']));
    place(10, 3, 0, 0);
    place(11, 4, 1, 1);
    expect(hitDetect(w, 10, 11)).toBe(true);
    place(11, 4, 0, 0); // a corner of the ring's box: row 0 spans only x 1
    expect(hitDetect(w, 10, 11)).toBe(false);
  });
});

/** Scripted input: weave left/right, fire in bursts, change altitude now and then. */
function script(tick: number): PlayerInput {
  const phase = Math.floor(tick / 60) % 4;
  return {
    left: phase === 0, right: phase === 2, up: tick % 200 < 30, down: tick % 200 > 170,
    fire: tick % 50 < 35, altitude: tick % 400 === 0, select: false, use: false, device: 1, mouseX: 0, mouseY: 0,
  };
}

function run(data: GameData, ticks: number, seed: number): World {
  const w = createWorld(data, seed);
  newGame(w);
  for (let t = 0; t < ticks; t++) step(w, [script(t)]);
  return w;
}

function fingerprint(w: World): string {
  const p = w.players[0];
  let h = 0;
  for (const a of [w.spr.n, w.spr.x, w.spr.y]) for (let i = 0; i < a.length; i++) h = (Math.imul(h, 31) + a[i]) | 0;
  return `${h} ${w.scrollY} ${p.life} ${p.shield} ${p.lives} ${p.money} ${w.rng.seed}`;
}

describe.skipIf(!hasData)('simulation (needs game/public/data)', () => {
  it('is deterministic', async () => {
    const data = await gameData();
    expect(fingerprint(run(data, 3000, 7))).toBe(fingerprint(run(data, 3000, 7)));
  });

  it('plays level 1 up to the boss trigger: scrolls 1 px per tick, spawns, kills and stops', async () => {
    const data = await gameData();
    const w = createWorld(data, 1);
    newGame(w);
    let spawned = 0, explosions = 0;
    for (let t = 0; t < 6000; t++) {
      step(w, [script(t)]);
      spawned = Math.max(spawned, w.enemies.filter((e) => e.active).length);
      explosions += w.explosions.filter((e) => e.active).length > 0 ? 1 : 0;
      if (w.scrolling) expect(w.scrollY).toBe(-t - 1);
    }
    expect(w.scrolling).toBe(false); // boss record at y -5561 stops the scroll
    expect(w.scrollY).toBe(data.tables.levels[0].boss_trigger_y);
    expect(spawned).toBeGreaterThan(3);
    expect(explosions).toBeGreaterThan(0);
    expect(w.players[0].money).toBeGreaterThan(0);
  });

  it.skipIf(!process.env.RENDER_TICK)('renders one frame without input at tick RENDER_TICK', async () => {
    const data = await gameData();
    const w = createWorld(data, 3);
    newGame(w);
    const ticks = Number(process.env.RENDER_TICK);
    const idle = NO_INPUT;
    for (let t = 0; t < ticks; t++) step(w, [idle]);
    const fb = new Framebuffer(data);
    fb.render(w);
    const out = join(__dirname, '..', 'test-output');
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, `tick${ticks}.bmp`), bmp(fb.px, W, H, data.palette.rgb));
  });

  it('renders frames (written to test-output/ when RENDER=1)', async () => {
    const data = await gameData();
    const w = createWorld(data, 3);
    newGame(w);
    const fb = new Framebuffer(data);
    const out = join(__dirname, '..', 'test-output');
    if (process.env.RENDER) mkdirSync(out, { recursive: true });
    for (let t = 1; t <= 1600; t++) {
      step(w, [script(t)]);
      if (t % 200 === 0) {
        fb.render(w);
        expect(fb.px.some((c) => c !== 0)).toBe(true);
        if (process.env.RENDER) writeFileSync(join(out, `frame${t}.bmp`), bmp(fb.px, W, H, data.palette.rgb));
      }
    }
  });
});
