// Input recordings of levels (dev build), for the gameplay videos (tools/trailer.mjs): the world at the level start
// plus every tick's player input. The simulation is deterministic, so a replay shows the same game, and it can be
// drawn at any frame rate, classic or remastered, in either language. A pause isn't recorded (no ticks run).

import type { GameData } from './data';
import { loadWorld, saveWorld, type WorldSnapshot } from './sim/snapshot';
import { NO_INPUT, type PlayerInput, type World } from './sim/state';
import { step } from './sim/tick';

/** The RNG seed is compared this often (in ticks), to catch a replay that went its own way. */
const CHECK_EVERY = 8;
const BUTTONS = ['left', 'right', 'up', 'down', 'fire', 'altitude', 'select', 'use'] as const;

/** A player's input in one tick: the buttons as bits, plus the pointer for a mouse player. */
type Packed = number | [number, number, number];

export interface Recording {
  version: 1;
  created: string; // ISO time
  level: number;
  language: string; // the language it was played in (for reference; a replay can use either)
  devices: number[]; // control type per player
  start: WorldSnapshot; // after StartLevel, before the first tick
  inputs: Packed[][]; // per tick, per player
  checks: number[]; // RNG seed before tick CHECK_EVERY * i
}

function pack(p: PlayerInput): Packed {
  let bits = 0;
  BUTTONS.forEach((b, i) => {
    if (p[b]) bits |= 1 << i;
  });
  return p.device === 2 ? [bits, p.mouseX, p.mouseY] : bits;
}

function unpack(device: number, v: Packed): PlayerInput {
  const [bits, mouseX, mouseY] = typeof v === 'number' ? [v, 0, 0] : v;
  const p: PlayerInput = { ...NO_INPUT, device, mouseX, mouseY };
  BUTTONS.forEach((b, i) => (p[b] = (bits & (1 << i)) !== 0));
  return p;
}

/** Records the level being played: `input` before every simulation tick, `end` once the level is left. */
export class Recorder {
  private rec: Recording | null = null;

  constructor(private readonly save: (r: Recording) => void) {}

  get recording(): Recording | null {
    return this.rec;
  }

  /** The players' input for the next tick; the first call of a level takes the snapshot. */
  input(w: World, players: PlayerInput[], language: string): void {
    if (!this.rec) {
      this.rec = {
        version: 1, created: new Date().toISOString(), level: w.level, language,
        devices: players.map((p) => p.device), start: saveWorld(w), inputs: [], checks: [],
      };
    }
    const r = this.rec;
    if (r.inputs.length % CHECK_EVERY === 0) r.checks.push(w.rng.seed);
    r.inputs.push(players.map(pack));
  }

  /** Save what has been recorded so far (the level goes on). */
  flush(): void {
    if (this.rec && this.rec.inputs.length > 0) this.save(this.rec);
  }

  /** The level is over (or left): save it, and start a new recording with the next level. */
  end(): void {
    this.flush();
    this.rec = null;
  }
}

/** Plays a recording back tick by tick. */
export class Replay {
  readonly world: World;
  tick = 0;
  /** The first tick whose RNG seed differs from the recording (null: none so far). */
  diverged: number | null = null;

  constructor(data: GameData, readonly rec: Recording) {
    this.world = loadWorld(data, rec.start);
  }

  get length(): number {
    return this.rec.inputs.length;
  }

  /** One simulation tick with the recorded input; false at the end of the recording. */
  step(): boolean {
    const r = this.rec;
    if (this.tick >= r.inputs.length) return false;
    const w = this.world;
    if (this.tick % CHECK_EVERY === 0 && this.diverged === null && r.checks[this.tick / CHECK_EVERY] !== w.rng.seed) {
      this.diverged = this.tick;
    }
    step(w, r.inputs[this.tick].map((v, i) => unpack(r.devices[i], v)));
    this.tick++;
    return true;
  }
}
