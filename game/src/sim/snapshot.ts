// The whole simulation state as JSON (without the game data), for input recordings (src/recording.ts): a level
// replays from the snapshot taken at its start. Typed arrays and Maps are tagged; the class instances (TpRandom,
// SpriteTable) are rebuilt on load. Generic on purpose, so a new World field is saved without changes here.

import type { GameData } from '../data';
import { createWorld, SpriteTable, type World } from './state';
import { TpRandom } from './tp';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type WorldSnapshot = { [key: string]: Json };

const TYPED: Record<string, new (values: number[]) => ArrayLike<number>> = { Int32Array, Uint8Array };

function encode(v: unknown): Json {
  if (v === null || typeof v !== 'object') return v as Json;
  if (ArrayBuffer.isView(v)) {
    const name = v.constructor.name;
    if (!(name in TYPED)) throw new Error(`snapshot: no ${name}`);
    return { $typed: name, v: Array.from(v as unknown as ArrayLike<number>) };
  }
  if (v instanceof Map) return { $map: [...v].map(([k, x]) => [encode(k), encode(x)]) };
  if (Array.isArray(v)) return v.map(encode);
  const out: { [key: string]: Json } = {};
  for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = encode(x);
  return out;
}

function decode(v: Json): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(decode);
  if ('$typed' in v) return new TYPED[v.$typed as string](v.v as number[]);
  if ('$map' in v) return new Map((v.$map as [Json, Json][]).map(([k, x]) => [decode(k), decode(x)]));
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) out[k] = decode(x);
  return out;
}

export function saveWorld(w: World): WorldSnapshot {
  const { data: _data, ...state } = w;
  return encode(state) as WorldSnapshot;
}

export function loadWorld(data: GameData, s: WorldSnapshot): World {
  const state = decode(s) as World;
  return {
    ...createWorld(data),
    ...state,
    data,
    rng: Object.assign(new TpRandom(), state.rng),
    spr: Object.assign(new SpriteTable(), state.spr),
    drawn: Object.assign(new SpriteTable(), state.drawn),
  };
}
