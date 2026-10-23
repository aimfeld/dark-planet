import { describe, expect, it } from 'vitest';
import { Recorder, Replay, type Recording } from '../src/recording';
import { saveWorld } from '../src/sim/snapshot';
import { createWorld, NO_INPUT, type PlayerInput, type World } from '../src/sim/state';
import { newGame, startLevel, step } from '../src/sim/tick';
import { TpRandom } from '../src/sim/tp';
import { gameData, hasData } from './helpers';

/** Busy, varied input from its own RNG (P1 keyboard, P2 mouse). */
function inputs(r: TpRandom): PlayerInput[] {
  const bits = r.next(256);
  const key: PlayerInput = {
    ...NO_INPUT, left: (bits & 1) !== 0, right: (bits & 2) !== 0, up: (bits & 4) !== 0, down: (bits & 8) !== 0,
    fire: (bits & 16) !== 0, altitude: r.next(40) === 0, select: r.next(60) === 0, use: r.next(90) === 0,
  };
  const mouse: PlayerInput = { ...NO_INPUT, device: 2, fire: r.next(2) === 0, mouseX: r.next(320), mouseY: r.next(200) };
  return [key, mouse];
}

/** Two players in a level: `skip` ticks unrecorded, then `ticks` recorded (the recording passes through JSON). */
async function record(level: number, skip: number, ticks: number): Promise<{ world: World; rec: Recording }> {
  const w = createWorld(await gameData(), 77);
  newGame(w, true);
  startLevel(w, level);
  const r = new TpRandom(5);
  for (let t = 0; t < skip; t++) step(w, inputs(r));
  let saved: Recording | null = null;
  const recorder = new Recorder((rec) => (saved = JSON.parse(JSON.stringify(rec))));
  for (let t = 0; t < ticks; t++) {
    const players = inputs(r);
    recorder.input(w, players, 'en');
    step(w, players);
  }
  recorder.end();
  return { world: w, rec: saved! };
}

describe.skipIf(!hasData)('input recordings', () => {
  it('replays a level from its start to the same state', async () => {
    const { world, rec } = await record(5, 0, 600);
    const replay = new Replay(await gameData(), rec);
    while (replay.step());
    expect(replay.diverged).toBeNull();
    expect(replay.tick).toBe(600);
    expect(saveWorld(replay.world)).toEqual(saveWorld(world));
  });

  it('replays from a snapshot in the middle of a level (enemies, shots, explosions under way)', async () => {
    const { world, rec } = await record(2, 700, 500);
    const replay = new Replay(await gameData(), rec);
    expect(replay.world.enemies.some((e) => e.active)).toBe(true);
    while (replay.step());
    expect(replay.diverged).toBeNull();
    expect(saveWorld(replay.world)).toEqual(saveWorld(world));
  });

  it('notices a replay that goes its own way', async () => {
    const { rec } = await record(1, 0, 400);
    rec.inputs = rec.inputs.map(([, p2]) => [16, p2]); // P1 only fires
    const replay = new Replay(await gameData(), rec);
    while (replay.step());
    expect(replay.diverged).not.toBeNull();
  });
});
