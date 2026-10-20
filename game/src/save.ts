// SAVE.DAT (docs/file-formats.md): written by the shop's "Save" bonus (Save 1d9e:0350), read by the main
// menu's "Spiel laden" (Load 1d9e:05D9). The remake keeps the original's 129-byte layout, checksum included,
// so an original SAVE.DAT can be loaded too.

import { newGameState } from './sim/tick';
import type { Player, World } from './sim/state';

export const SAVE_SIZE = 129;
const BLOCK = 60; // one player
const P1_BLOCK = 9;

/** Checksum 1d9e:02CC: 16-bit sum of level, episode and per player lives, low word of money, jet, engine, shield. */
export function saveChecksum(b: Uint8Array): number {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let sum = b[7] + b[8];
  for (const o of [P1_BLOCK, P1_BLOCK + BLOCK]) {
    sum += v.getInt16(o, true) + v.getUint16(o + 2, true) + b[o + 6] + b[o + 55] + b[o + 56];
  }
  return (sum << 16) >> 16; // sign-extended to the stored LongInt
}

export function encodeSave(w: World): Uint8Array {
  const b = new Uint8Array(SAVE_SIZE);
  const v = new DataView(b.buffer);
  b[4] = w.twoPlayer ? 1 : 0;
  b[5] = w.players[0].active ? 1 : 0;
  b[6] = w.players[1].active ? 1 : 0;
  b[7] = w.level;
  b[8] = Math.trunc((w.level - 1) / 3) + 1;
  w.players.forEach((p, i) => {
    const o = P1_BLOCK + BLOCK * i;
    v.setInt16(o, p.lives, true);
    v.setInt32(o + 2, p.money, true);
    b[o + 6] = p.jet;
    p.mounts.forEach((m, k) => {
      const mo = o + 7 + 6 * k;
      v.setInt16(mo, m.reload, true);
      b[mo + 2] = m.loaded ? 1 : 0;
      b[mo + 3] = m.occupied ? 1 : 0;
      b[mo + 4] = m.item;
      b[mo + 5] = m.cat;
    });
    b[o + 55] = p.engine;
    b[o + 56] = p.shieldType;
    b.set(p.bonus, o + 57);
  });
  v.setInt32(0, saveChecksum(b), true);
  return b;
}

/** Load into `w`: false when the checksum doesn't match (the original quits with a message then). */
export function decodeSave(b: Uint8Array, w: World): boolean {
  if (b.length < SAVE_SIZE) return false;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (v.getInt32(0, true) !== saveChecksum(b)) return false;
  newGameState(w);
  w.twoPlayer = b[4] !== 0;
  w.level = b[7];
  w.episode = b[8];
  w.players.forEach((p: Player, i) => {
    const o = P1_BLOCK + BLOCK * i;
    p.active = b[5 + i] !== 0;
    p.lives = v.getInt16(o, true);
    p.money = v.getInt32(o + 2, true);
    p.jet = b[o + 6];
    p.mounts.forEach((m, k) => {
      const mo = o + 7 + 6 * k;
      Object.assign(m, { reload: v.getInt16(mo, true), loaded: b[mo + 2] !== 0, occupied: b[mo + 3] !== 0, item: b[mo + 4], cat: b[mo + 5] });
    });
    p.engine = b[o + 55];
    p.shieldType = b[o + 56];
    p.bonus = [b[o + 57], b[o + 58], b[o + 59]];
  });
  return true;
}
