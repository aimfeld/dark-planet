// The 1997 prototype (src/sly/): runs SLYVERS's main program headless.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadSlyData, type SlyData } from '../src/sly/data';
import { H, SlyFramebuffer, W } from '../src/sly/framebuffer';
import { FRAME_MS, Sly, type SlyInput } from '../src/sly/sim';
import { bmp } from './helpers';

const DIR = join(__dirname, '..', 'public', 'sly');
const hasData = existsSync(join(DIR, 'sly.json'));
const OUT = join(__dirname, '..', 'test-output', 'sly');

function data(): Promise<SlyData> {
  return loadSlyData({
    json: async (name) => JSON.parse(readFileSync(join(DIR, name), 'utf8')),
    binary: async (name) => {
      const b = readFileSync(join(DIR, name));
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    },
  });
}

const IDLE: SlyInput = { left: false, right: false, up: false, down: false, fire: false, stop: false };

/** Steps the program; `input(frame)` per game frame. Returns the frames played (FRAME_MS steps). */
function play(sly: Sly, program: Generator<number>, frames: number, input: (f: number) => SlyInput = () => IDLE): number {
  let f = 0;
  while (f < frames) {
    sly.input(input(f));
    const step = program.next();
    sly.sounds.length = 0;
    if (step.done) break;
    if (step.value === FRAME_MS) f++;
  }
  return f;
}

describe.skipIf(!hasData)('Sly version', () => {
  it('scrolls 1 px per frame to the boss at -1100, which then moves along its path', async () => {
    const d = await data();
    const sly = new Sly(d, () => 0);
    const program = sly.run();
    play(sly, program, 1);
    expect(sly.a.startVirtualY).toBe(-1);
    // dodge: keep left and fire; the boss trigger stops the scrolling at -1100
    play(sly, program, 1200, (f) => ({ ...IDLE, fire: f % 2 === 0, left: true }));
    expect(sly.a.startVirtualY).toBe(-1100);
    const bossSlot = [...sly.a.n].findIndex((n, slot) => n === 8 && slot > 181);
    expect(bossSlot).toBeGreaterThan(0);
  });

  it('renders the start, a fight and the boss', async () => {
    const d = await data();
    const sly = new Sly(d, () => 0);
    const program = sly.run();
    const fb = new SlyFramebuffer(d);
    mkdirSync(OUT, { recursive: true });
    const shots: [number, string][] = [[1, 'start'], [520, 'ufos'], [1150, 'boss']];
    let done = 0;
    for (const [frame, name] of shots) {
      done += play(sly, program, frame - done, (f) => ({ ...IDLE, fire: (f & 1) === 0, right: f % 200 < 60 }));
      fb.render(sly);
      expect(fb.px.some((c) => c !== 0)).toBe(true);
      const rgb = Array.from({ length: 256 }, (_, i) => [0, 1, 2].map((k) => Math.floor((sly.a.palette[3 * i + k] * 255) / 63)));
      writeFileSync(join(OUT, `${name}.bmp`), bmp(fb.px, W, H, rgb));
    }
  });

  it('ends after Esc with a short fade', async () => {
    const d = await data();
    const sly = new Sly(d, () => 0);
    const program = sly.run();
    play(sly, program, 10);
    sly.input({ ...IDLE, stop: true });
    let steps = 0;
    while (!program.next().done) steps++;
    expect(steps).toBe(10); // UNTIL (Stop), then FadeToPalette(black, 10)
    expect(sly.a.palette.every((c) => c === 0)).toBe(true);
  });
});
