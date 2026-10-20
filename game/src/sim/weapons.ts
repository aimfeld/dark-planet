// Player weapons: FirePods @0x1961C, SpawnShot @0x111A4, ReloadPods @0x192A4, MoveShots @0x13C37
// (docs/gameplay-spec.md §4).

import type { Pod, Volley } from '../data';
import { explode, startAnim } from './effects';
import { nearestEnemy } from './enemies';
import { centerX, centerY, spriteH } from './sprites';
import { playSound, type Mount, type Player, type Shot, type World } from './state';
import { cosDeg, mod, round, sinDeg } from './tp';

function jetExtents(w: World, p: Player) {
  return w.data.tables.jets[p.jet - 1].extents;
}

/** Jet nose: cx = L + (R - L) div 2 (1d9e:135D), T. */
export function nose(w: World, p: Player): [number, number] {
  const e = jetExtents(w, p);
  return [e.l + ((e.r - e.l) >> 1), e.t];
}

/** Large-pod mount point relative to the jet sprite (1d9e:0B2C). */
export function mountPoint(w: World, p: Player, mount: number): [number, number] {
  const e = jetExtents(w, p);
  const o = w.data.tables.mount_offsets.find((m) => m.mount === mount);
  if (!o) return [0, 0];
  const base = o.x_from === 'cx' ? nose(w, p)[0] : o.x_from === 'l' ? e.l : e.r;
  return [base + o.dx, e.t + o.dy];
}

function itemOf(w: World, m: Mount): Pod | undefined {
  const t = w.data.tables;
  if (m.cat === 1) return t.small_pods[m.item - 1];
  if (m.cat === 2) return t.large_pods[m.item - 1];
  if (m.cat === 6) return t.ball_pods[m.item - 1];
  return undefined;
}

/** ItemInfo(cat, 9, item): the reload interval. */
function reloadOf(w: World, m: Mount): number {
  if (m.cat === 8) return w.data.tables.jets[m.item - 1].standard_weapon.reload;
  // Original bug (spec §12 #2): the Distroyer ball pod has reload 0 and fired once per level.
  if (m.cat === 6 && m.item === 3) return DISTROYER_RELOAD;
  return itemOf(w, m)?.reload ?? 0;
}

/** Design value for the fix of spec §12 #2: like the Firestorm's gun. */
const DISTROYER_RELOAD = 10;

/** ItemInfo(cat, 8, item): the fire sound (255 = none). */
function soundOf(w: World, m: Mount): number {
  if (m.cat === 8) return w.data.tables.jets[m.item - 1].standard_weapon.sound;
  return itemOf(w, m)?.sound ?? 255;
}

/**
 * SpawnShot(type, pattern, dx, dy, jet, mount) @0x111A4: offsets are relative to the jet sprite.
 * Bonus shots pass mount -1 (or -2 for the second Twin-Laser beam) and belong to no pod.
 */
export function spawnShot(w: World, p: Player, mount: number, v: Volley, dx: number, dy: number): Shot | undefined {
  const i = p.shots.findIndex((s) => !s.active);
  if (i < 0) return undefined; // table full: the shot is dropped and the mount stays loaded
  const s = p.shots[i];
  const jet = p.slots.jet;
  s.active = true;
  s.slot = p.slots.shot + i;
  s.pattern = v.pattern;
  s.age = 0;
  s.type = v.type;
  s.mount = mount;
  s.alt = p.high;
  w.spr.n[s.slot] = w.data.tables.shot_types[v.type - 1].sprite;
  w.spr.mode[s.slot] = 0;
  w.spr.x[s.slot] = w.spr.x[jet] + dx;
  w.spr.y[s.slot] = w.spr.y[jet] + dy;
  const m = mount >= 0 ? p.mounts[mount] : undefined;
  // Original bug (spec §12 #14): bonus shots read a mount record out of range (index -1/-2, or the Star's
  // shot number 0-4) for their sound; the remake plays only the bonus's own sound (UseBonus).
  let dropped = false;
  if (m && m.cat === 1 && m.item === 4) {
    // Autogun: aim at the centre of Nearest(1) from the jet's centre; without a target the shot is dropped
    // (the mount still unloads)
    s.target = nearestEnemy(w, centerX(w, jet), centerY(w, jet));
    if (s.target === 0) {
      killShot(w, p, i);
      dropped = true;
    } else {
      const t = w.enemies[s.target].slot;
      s.tx = centerX(w, t);
      s.ty = centerY(w, t);
      // Original bug (spec §12 #4): this branch skipped the fire sound; the remake plays it.
      playSound(w, soundOf(w, m), { belowVoices: 5 });
    }
  } else if (m) {
    const snd = soundOf(w, m);
    if (snd !== 255) playSound(w, snd, { belowVoices: 5 });
  }
  if (m && m.cat === 2 && m.item === 1) startAnim(w, 5, s.slot); // the Flamer's flame (sprites 157-166)
  s.sx = w.spr.x[s.slot];
  s.sy = w.spr.y[s.slot];
  if (v.type === 10) s.tx = w.rng.next(360);
  if (v.type === 11 && mount === -1) s.tx = 0;
  if (mount === -2) s.tx = 180;
  if (m) m.loaded = false;
  return dropped ? undefined : s;
}

/** FirePods @0x1961C: every loaded mount fires its volley while fire is held. */
export function firePods(w: World, p: Player): void {
  if (!p.fire) return;
  const [cx, t] = nose(w, p);
  for (let i = 0; i < 8; i++) {
    const m = p.mounts[i];
    if (!m.occupied || !m.loaded) continue;
    if (m.cat === 8) {
      for (const v of w.data.tables.jets[m.item - 1].standard_weapon.volley) spawnShot(w, p, i, v, cx + v.dx, t + v.dy);
    } else if (m.cat === 1) {
      const pod = w.data.tables.small_pods[m.item - 1];
      for (const v of pod.volley) spawnShot(w, p, i, v, cx + v.dx, t + v.dy);
    } else if (m.cat === 2) {
      const pod = w.data.tables.large_pods[m.item - 1];
      const [mx, my] = mountPoint(w, p, i);
      for (const v of pod.volley) spawnShot(w, p, i, v, mx + v.dx, my + v.dy);
      if (pod.fire_anim) startAnim(w, pod.fire_anim, p.slots.pods + i);
    } else if (m.cat === 6) {
      const pod = w.data.tables.ball_pods[m.item - 1];
      const ball = p.slots.pods + 7;
      const bx = w.spr.x[ball] + 5 - w.spr.x[p.slots.jet];
      const by = w.spr.y[ball] + 5 - w.spr.y[p.slots.jet];
      for (const v of pod.volley) spawnShot(w, p, i, v, bx + v.dx, by + v.dy);
    }
  }
}

/** ReloadPods @0x192A4. */
export function reloadPods(w: World, p: Player): void {
  for (const m of p.mounts) {
    if (!m.occupied) continue;
    const r = reloadOf(w, m);
    if (r <= 0) continue;
    if (!m.loaded) m.reload -= 1;
    if (m.reload < 1) {
      m.loaded = true;
      m.reload = r;
    }
  }
}

export function killShot(w: World, p: Player, i: number): void {
  const s = p.shots[i];
  s.active = false;
  w.spr.n[s.slot] = 0;
}

const NO_X_LIMIT = new Set([5, 6, 10, 11, 22]);
const NO_Y_LIMIT = new Set([5, 10, 22]);

/** MoveShots @0x13C37 (patterns, spec §4.5). Shots live in level coordinates. */
export function moveShots(w: World, p: Player): void {
  const types = w.data.tables.shot_types;
  const [cx] = nose(w, p);
  const halfB = w.data.tables.jets[p.jet - 1].extents.b >> 1;
  for (let i = 0; i < 48; i++) {
    const s = p.shots[i];
    if (!s.active) continue;
    s.age += 1;
    const sp = types[s.type - 1].speed;
    const n = s.slot;
    const jet = p.slots.jet;
    const oldY = w.spr.y[n];
    switch (s.pattern) {
      case 0: // beams glued to the jet
        w.spr.y[n] -= 1;
        w.spr.x[n] = w.spr.x[n] < w.spr.x[jet] + cx ? w.spr.x[jet] + cx - 10 : w.spr.x[jet] + cx + 5;
        w.spr.y[n] = w.spr.y[jet] - 175;
        if (s.age > 2) killShot(w, p, i);
        break;
      case 1:
        w.spr.y[n] -= sp;
        break;
      case 2: w.spr.y[n] -= sp; w.spr.x[n] += 1; break;
      case 3: w.spr.y[n] -= sp; w.spr.x[n] -= 1; break;
      case 4:
      case 5: // missiles: sideways, pause, then accelerate upward
        if (s.age <= 12) {
          w.spr.x[n] += s.pattern === 4 ? 1 : -1;
          w.spr.y[n] -= 1;
        } else if (s.age >= 15) w.spr.y[n] -= Math.trunc(s.age / 4);
        break;
      case 6: // a wave of amplitude 50 (no player weapon uses it)
        w.spr.y[n] -= 3;
        w.spr.x[n] = round(s.sx + 50 * sinDeg(2.25 * oldY));
        break;
      case 7: // Autogun: a straight line through the target point fixed at spawn
      case 8: // homing on the target enemy's top-left corner (no player weapon uses it)
        if (s.pattern === 8) {
          s.tx = w.spr.x[w.enemies[s.target].slot];
          s.ty = w.spr.y[w.enemies[s.target].slot];
        }
        aimStep(w, s, sp);
        break;
      case 9: { // Flamer: the flame is glued to its pod
        const [mx, my] = mountPoint(w, p, s.mount);
        w.spr.x[n] = w.spr.x[jet] + mx - 39;
        w.spr.y[n] = w.spr.y[jet] + my - 64;
        if (s.age > 18) killShot(w, p, i);
        break;
      }
      case 10: // Windstorm: a wave that widens with age
        w.spr.y[n] -= sp;
        w.spr.x[n] = round(s.sx + s.age * sinDeg(3 * oldY));
        break;
      case 11: { // Blast: spiral around the jet
        s.tx += sp;
        const r = 3 * s.age + 20;
        w.spr.x[n] = cx + w.spr.x[jet] - 6 + round(r * cosDeg(s.tx));
        w.spr.y[n] = halfB + w.spr.y[jet] - 6 - round(r * sinDeg(s.tx));
        if (s.age > 60) killShot(w, p, i);
        break;
      }
      case 12: // Twin-Laser: sine of amplitude 40 around the start
        w.spr.y[n] -= 3;
        s.tx += 15;
        w.spr.x[n] = round(s.sx + 40 * sinDeg(s.tx)) - 5;
        break;
      case 13: // atom bomb: rises slowly, explodes after 80 ticks; the bomb timer does the damage
        w.spr.y[n] -= sp;
        if (s.age > 80) {
          killShot(w, p, i);
          p.bombTimer = 5;
          explode(w, w.spr.x[n] - 65, w.spr.y[n] - 65, 14, false);
        }
        break;
      case 14:
        w.spr.y[n] -= sp + Math.trunc(s.age / 3);
        break;
      case 15: w.spr.x[n] += sp; w.spr.y[n] -= sp; break;
      case 16: w.spr.x[n] -= sp; w.spr.y[n] -= sp; break;
      case 17: w.spr.x[n] += sp; w.spr.y[n] += sp; break;
      case 18: w.spr.x[n] -= sp; w.spr.y[n] += sp; break;
      case 19: w.spr.x[n] += sp; break;
      case 20: w.spr.x[n] -= sp; break;
      case 21: w.spr.y[n] += sp; break;
      case 22: { // Star: orbits outward around a point up-left of the jet, then burns out (anim 0xD, rest 0)
        s.tx += sp;
        const r = s.age + 15;
        w.spr.x[n] = cx + w.spr.x[jet] + round(r * cosDeg(s.tx)) - 53;
        w.spr.y[n] = halfB + w.spr.y[jet] - 42 - round(r * sinDeg(s.tx));
        if (s.age === 20) startAnim(w, 0x0d, n);
        break;
      }
      case 23: // G-Destructor: jitters 7 px to a random side every tick while rising 4-9 px
        s.tx = w.rng.next(10) < 5 ? 1 : -1;
        w.spr.x[n] += 7 * s.tx;
        w.spr.y[n] -= w.rng.next(6) + 4;
        break;
    }
    if (!s.active) continue;
    if (w.spr.n[n] === 0) {
      killShot(w, p, i);
      continue;
    }
    const x = w.spr.x[n], y = w.spr.y[n];
    if ((x > 319 || x < 0) && !NO_X_LIMIT.has(s.type)) {
      killShot(w, p, i);
      continue;
    }
    const h = spriteH(w, w.spr.n[n]);
    if ((y < w.scrollY - h || y > w.scrollY + 199) && s.pattern !== 0 && !NO_Y_LIMIT.has(s.type)) killShot(w, p, i);
  }
  // the ball pod orbits the jet: radius 40, k degrees per tick (k = orbit factor of the pod)
  const ball = p.mounts[7];
  if (ball.occupied) {
    const a = w.data.tables.ball_pods[ball.item - 1].orbit_factor! * mod(w.frame, 360);
    const jet = p.slots.jet;
    w.spr.x[p.slots.pods + 7] = cx + w.spr.x[jet] - 6 + round(40 * cosDeg(a));
    w.spr.y[p.slots.pods + 7] = halfB + w.spr.y[jet] - 6 - round(40 * sinDeg(a));
  }
}

/**
 * Patterns 7/8: the axis with the larger distance from the start to the target steps by the shot speed,
 * the other is interpolated from the start (the shot flies on past the target).
 * Original bugs (spec §12 #15): the interpolation multiplied in 16 bits (MUL + CWD), so at wide angles the
 * product wrapped and the shot jumped sideways, and a target exactly at the start divided 0 by 0 (runtime
 * error 200). The remake multiplies exactly and keeps x at the start then.
 */
function aimStep(w: World, s: Shot, sp: number): void {
  const n = s.slot;
  const dx = Math.abs(s.tx - s.sx), dy = Math.abs(s.ty - s.sy);
  if (dy < dx) {
    w.spr.x[n] += s.tx < s.sx ? -sp : sp;
    w.spr.y[n] = s.sy + round(((s.ty - s.sy) * Math.abs(w.spr.x[n] - s.sx)) / dx);
  } else {
    w.spr.y[n] += s.ty < s.sy ? -sp : sp;
    w.spr.x[n] = dy === 0 ? s.sx : s.sx + round(((s.tx - s.sx) * Math.abs(w.spr.y[n] - s.sy)) / dy);
  }
}
