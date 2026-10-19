// Sprite-table helpers shared by the game logic.

import type { Sprite } from '../data';
import type { World } from './state';

export function sprite(w: World, n: number): Sprite | undefined {
  return n > 0 ? w.data.sprites.get(n) : undefined;
}

/** Width / height of sprite number n (1d9e:2754 / 1d9e:2791); 0 for none. */
export function spriteW(w: World, n: number): number {
  return sprite(w, n)?.w ?? 0;
}
export function spriteH(w: World, n: number): number {
  return sprite(w, n)?.h ?? 0;
}

/** Centre of the sprite in a slot (1d9e:088D / 08CA). */
export function centerX(w: World, slot: number): number {
  return w.spr.x[slot] + (spriteW(w, w.spr.n[slot]) >> 1);
}
export function centerY(w: World, slot: number): number {
  return w.spr.y[slot] + (spriteH(w, w.spr.n[slot]) >> 1);
}

/**
 * AniVGA HitDetect @28be:29B9: within the overlap of the two bounding boxes there must be some row
 * where both sprites' opaque spans [x + left, x + right] intersect, and some column where both
 * [y + top, y + bottom] intersect (empty columns skipped). Not pixel-exact.
 */
export function hitDetect(w: World, a: number, b: number): boolean {
  if (a === b) return false;
  const sa = sprite(w, w.spr.n[a]);
  const sb = sprite(w, w.spr.n[b]);
  if (!sa || !sb) return false;
  const xa = w.spr.x[a], ya = w.spr.y[a], xb = w.spr.x[b], yb = w.spr.y[b];

  const rowTop = Math.max(ya, yb), rowBottom = Math.min(ya + sa.h, yb + sb.h) - 1;
  const colLeft = Math.max(xa, xb), colRight = Math.min(xa + sa.w, xb + sb.w) - 1;
  if (rowBottom < rowTop || colRight < colLeft) return false;

  let rowHit = false;
  for (let y = rowBottom; y >= rowTop; y--) {
    const l = Math.max(sa.left[y - ya] + xa, sb.left[y - yb] + xb);
    const r = Math.min(sa.right[y - ya] + xa, sb.right[y - yb] + xb);
    if (r >= l) {
      rowHit = true;
      break;
    }
  }
  if (!rowHit) return false;
  for (let x = colRight; x >= colLeft; x--) {
    const ta = sa.top[x - xa], tb = sb.top[x - xb];
    if (ta === 16000 || tb === 16000) continue;
    const t = Math.max(ta + ya, tb + yb);
    const btm = Math.min(sa.bottom[x - xa] + ya, sb.bottom[x - xb] + yb);
    if (btm >= t) return true;
  }
  return false;
}
