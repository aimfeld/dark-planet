// Enemies: spawning, movement subs, guns, enemy shots, kills (docs/gameplay-spec.md §6-7).

import type { EnemyType } from '../data';
import { clearBonuses, dropBonus } from './bonus';
import { clearExplosions, explode, startAnim } from './effects';
import { addMoney } from './player';
import { centerX, spriteH, spriteW } from './sprites';
import { FADE_STEPS, playSound, stopSound, type Enemy, type Player, type World } from './state';
import { cosDeg, mod, round, sinDeg } from './tp';
import { killShot } from './weapons';

export const BOSS_TYPES = new Set([0x05, 0x20, 0x23, 0x3c, 0x43, 0x48]);

export function typeOf(w: World, e: Enemy): EnemyType {
  return w.data.tables.enemy_types[e.type - 1];
}

/** FindFreeEnemySlot @0x1159F: the Golem is always slot 2, its laser slot 1; 30 = none free. */
function findFreeSlot(w: World, type: number): number {
  if (type === 0x48) return 2;
  if (type === 0x4a) return 1;
  for (let i = 1; i <= 29; i++) {
    const e = w.enemies[i];
    if (!e.active && !e.dying && e.energy === 0) return i;
  }
  return 30;
}

/**
 * SpawnEnemy(x, y, type, sub, delay) @0x1163A. y is the bottom edge (the sprite enters from above).
 * A non-zero delay reserves the slot and spawns after that many ticks (EnemyUpdate counts it down).
 */
export function spawnEnemy(w: World, x: number, y: number, type: number, sub: number, delay = 0): void {
  const i = findFreeSlot(w, type);
  if (type >= 0x4b || i >= 30) return;
  const t = w.data.tables.enemy_types[type - 1];
  const e = w.enemies[i];
  e.dying = false;
  e.slot = t.layer === 1 ? i + 381 : i + 813;
  e.type = type;
  e.sub = sub;
  e.energy = t.energy;
  if (w.twoPlayer) e.energy += round(t.energy / 2);
  for (let g = 0; g < 4; g++) {
    e.inter[g] = 0;
    e.pause[g] = 0;
    e.left[g] = t.guns.find((gun) => gun.gun === g + 1)?.salvo ?? 0;
  }
  e.t = 1;
  e.x0 = x;
  e.y0 = y;
  e.angle = null;
  e.phase = 1;
  e.c = 1;
  e.layer = t.layer;
  e.shadowSlot = t.layer === 1 ? i + 491 : i + 843;
  if (delay !== 0) {
    e.energy = delay;
    return;
  }
  e.active = true;
  w.spr.n[e.slot] = t.sprite;
  w.spr.mode[e.slot] = 0;
  w.spr.x[e.slot] = x;
  w.spr.y[e.slot] = y - spriteH(w, t.sprite);
  if (type === 0x08) {
    startAnim(w, 0x12, e.slot);
    playSound(w, 0x14);
  }
  if (type === 0x0f) startAnim(w, 7, e.slot);
  if (type === 0x14) startAnim(w, 0x0e, e.slot);
  if (type === 0x17) playSound(w, 0x1e);
  if (type === 0x2c) playSound(w, 0x2e);
  if (type === 0x36) startAnim(w, 0x1a, e.slot);
  if (type === 0x42) {
    playSound(w, 0x2f);
    startAnim(w, 0x23, e.slot);
  }
  if (type === 0x4a) startAnim(w, 0x29, e.slot);
}

const SPAWN_Y_OFFSET: Record<number, number> = { 0x08: 20, 0x0f: 25, 0x14: 10, 0x2d: 130, 0x36: 30 };

/** SpawnFromLevel @0x16653: every record with y = scrollY fires (flag filter is a no-op, spec §6). */
export function spawnFromLevel(w: World): void {
  for (const r of w.data.levels[w.level - 1].records) {
    if (r.y !== w.scrollY || r.type >= 0x4b) continue;
    let y = w.scrollY + (SPAWN_Y_OFFSET[r.type] ?? 0);
    const x = r.x + (r.type === 0x2d ? -50 : 0);
    if (r.type === 0x40) {
      spawnEnemy(w, x - 22, y - 17, 0x41, 0x23);
      spawnEnemy(w, x + 22, y - 17, 0x41, 0x24);
    }
    if (BOSS_TYPES.has(r.type)) startBossFight(w);
    else spawnEnemy(w, x, y, r.type, r.sub, r.type === 0x42 ? 0x50 : 0);
  }
}

/** StartBossFight's blocking parts in ticks: fade out (20 retraces), Delay(1200), fade in. */
export const BOSS_FADE_TICKS = 11;
export const BOSS_BLACK_TICKS = 48;
export const BOSS_FREEZE_TICKS = 2 * BOSS_FADE_TICKS + BOSS_BLACK_TICKS;

/**
 * StartBossFight @0x1627E: scrolling stops for good; boss music; players to screen y 160; enemies, shots,
 * enemy shots, explosions and bonus objects cleared; the level's boss parts spawn at fixed positions (parts
 * first, so they take enemy slots 1, 2, ...). The original then blocks (fade out, 1.2 s, fade in); the
 * remake freezes the game for those ticks (tick.ts).
 */
function startBossFight(w: World): void {
  w.scrolling = false;
  w.track = 8;
  for (const p of w.players) w.spr.y[p.slots.jet] = w.scrollY + 160;
  for (let i = 1; i <= 29; i++) {
    const e = w.enemies[i];
    Object.assign(e, { active: false, dying: false, energy: 0 });
    w.spr.n[e.slot] = 0;
    w.spr.n[e.shadowSlot] = 0;
  }
  for (const p of w.players) for (let i = 0; i <= 47; i++) killShot(w, p, i);
  for (let k = 1; k <= 49; k++) killEnemyShot(w, k);
  clearExplosions(w);
  clearBonuses(w);
  const boss = w.data.tables.levels[w.level - 1].boss;
  for (const n of boss.sounds) playSound(w, n);
  if (boss.loop_sound !== null) playSound(w, boss.loop_sound, { loop: true });
  for (const sp of boss.spawns) spawnEnemy(w, sp.x, w.scrollY + sp.dy, sp.type, sp.sub);
  w.freeze = BOSS_FREEZE_TICKS;
  w.fade = FADE_STEPS;
}

/** BossScript(5) @0x122C3: a boss core was hit. TODO(slice): levels 3-6 react differently or not at all. */
export function bossHit(w: World): void {
  if ((w.level === 1 || w.level === 2) && w.rng.next(3) === 0) {
    const n = (w.level === 1 ? 0x23 : 0x11) + w.rng.next(3);
    playSound(w, n);
    playSound(w, n);
  }
}

/** FireAllGuns(target, enemy) @0x16B91: scripted salvo from every gun of the enemy's class. */
function fireAllGuns(w: World, i: number, target: number): void {
  if (!w.enemies[i].active) return;
  for (const gun of typeOf(w, w.enemies[i]).guns) if (gun.kind !== 0) enemyFire(w, i, gun.gun, target);
}

/**
 * Arc helper @0x16A11: angle += 40 * step / r; position = (cx + Round(r cos a), cy - Round(r sin a));
 * when the angle passes a1 the enemy moves on to `next` and the angle is reset.
 */
function arc(w: World, e: Enemy, cx: number, cy: number, r: number, step: number, a0: number, a1: number, next: number): void {
  if (e.angle === null) e.angle = a0;
  e.angle += (40 * step) / r;
  w.spr.x[e.slot] = cx + round(r * cosDeg(e.angle));
  w.spr.y[e.slot] = cy - round(r * sinDeg(e.angle));
  if ((step > 0 && e.angle >= a1) || (step < 0 && e.angle <= a1)) {
    e.phase = next;
    e.angle = null;
  }
}

/** Movement by sub (EnemyUpdate @0x16C0E, spec §7.3). Screen-space: +1 dy = fixed to the ground. */
function moveSub(w: World, e: Enemy, i: number): void {
  const s = e.slot;
  const t = e.t;
  switch (e.sub) {
    case 0:
    case 9:
      break;
    case 1:
      w.spr.y[s] += 1;
      break;
    case 2:
      if (t >= 1 && t <= 90) w.spr.y[s] += 2;
      else if (t >= 100 && t <= 150) w.spr.y[s] -= 2;
      else if (t >= 160 && t <= 300) w.spr.y[s] += 2;
      break;
    case 3:
      w.spr.y[s] += 2;
      w.spr.x[s] = round(e.x0 + 40 * sinDeg(8 * t));
      break;
    case 4:
      if (t === 1) e.c = 2;
      if (t >= 1 && t <= 30) w.spr.y[s] += 2;
      else if (t > 30 && t < 301) {
        w.spr.y[s] += e.c;
        if (mod(t, 5) === 0) e.c += 1;
      }
      break;
    case 5:
      if (e.phase === 1) arc(w, e, e.x0, w.scrollY + 50, 60, -5, 90, 0, 2);
      else if (e.phase === 2) arc(w, e, e.x0 + 20, w.scrollY + 50, 40, -5, 0, -270, 3);
      else if (e.phase === 3) arc(w, e, e.x0 + 20, w.scrollY + 130, 120, -5, 90, -90, 4);
      break;
    case 6:
    case 0x0d:
      w.spr.y[s] += 2;
      break;
    case 0x0a:
      if ((t >= 0 && t <= 70) || (t > 139 && t < 801)) w.spr.y[s] += 2;
      break;
    case 0x0b:
      if (e.phase === 1) {
        w.spr.y[s] += 3;
        if (w.scrollY + 40 < w.spr.y[s]) {
          e.phase = 2;
          e.c = 0;
        }
      } else if (e.phase === 2) {
        e.c += 1;
        const a = mod(e.c * 10 + 180, 360);
        e.angle = a;
        w.spr.x[s] = e.c + e.x0 + 20 + round(20 * cosDeg(a));
        w.spr.y[s] = w.scrollY + 40 - round(20 * sinDeg(a));
        if (a > 170 && a < 190 && w.spr.x[s] > 230) e.phase = 3;
      } else if (e.phase === 3) w.spr.y[s] += 3;
      break;
    case 0x0c:
      w.spr.y[s] += 2;
      if (t === 1 || mod(t, 10) === 0) e.c = w.rng.next(5) - 2;
      w.spr.x[s] += e.c;
      if (w.spr.x[s] < 0) e.c = 2;
      if (w.spr.x[s] > 300) e.c = -2;
      break;
    case 0x0e:
      w.spr.y[s] += 1;
      if (mod(t, 5) === 0) w.spr.x[s] -= 1;
      break;
    case 0x0f:
      w.spr.y[s] += 1;
      w.spr.x[s] -= 1;
      break;
    case 0x10:
      w.spr.x[s] -= 3;
      w.spr.y[s] += 2;
      break;
    case 0x11:
      w.spr.y[s] += 1;
      w.spr.x[s] += 1;
      break;
    case 0x14: { // level 1 boss pair (core 0x23 + escort 0x24): a 426-tick loop
      const c = ++e.c;
      if (c >= 1 && c <= 50) w.spr.y[s] += 1;
      else if (c <= 100) {
        w.spr.x[s] -= 1;
        w.spr.y[s] -= 1;
      } else if (c <= 140) w.spr.x[s] -= 1;
      else if (c <= 165) w.spr.y[s] += 4;
      else if (c <= 215) w.spr.y[s] -= 2;
      else if (c <= 305) w.spr.x[s] += 2;
      else if (c <= 330) w.spr.y[s] += 4;
      else if (c <= 380) w.spr.y[s] -= 2;
      else if (c < 426) w.spr.x[s] -= 2;
      if (e.c > 425) e.c = 0;
      if (e.c === 140 || e.c === 305) {
        playSound(w, 0x25);
        playSound(w, 0x25);
      }
      if (e.type === 0x23 && (e.c === 50 || e.c === 140 || e.c === 305)) fireAllGuns(w, i, 0);
      break;
    }
    default:
      // TODO(slice): subs 7, 8, 0x12, 0x13, 0x15-0x2A (bosses and the episode-2 enemies, spec §7.3 and §8).
      // Until then they hold their screen position.
      break;
  }
}

/** EnemyUpdate @0x16C0E (the parts this slice needs; see moveSub). */
export function enemyUpdate(w: World): void {
  for (let i = 1; i <= 29; i++) {
    const e = w.enemies[i];
    if (e.active || e.dying) {
      if (w.scrolling) w.spr.y[e.slot] -= 1;
      e.t += 1;
      moveSub(w, e, i);
      const y = w.spr.y[e.slot], x = w.spr.x[e.slot];
      const exempt = BOSS_TYPES.has(e.type) || e.type === 0x4a;
      if (!exempt && (w.scrollY + 200 <= y || x < w.scrollX - 50 || w.scrollX + 370 < x)) killEnemy(w, i, false, false);
    } else if (e.energy > 0) {
      e.energy -= 1;
      if (e.energy === 0) spawnEnemy(w, e.x0, e.y0, e.type, e.sub);
    }
  }
}

/** EnemyGuns @0x193CD: salvo logic per gun (spec §7.4). */
export function enemyGuns(w: World): void {
  for (let i = 1; i <= 29; i++) {
    const e = w.enemies[i];
    if (!e.active) continue;
    const t = typeOf(w, e);
    if (t.gun_class === 0 || t.scripted_only) continue;
    if (e.t < (t.fire_delay ?? 0)) for (let g = 0; g < 4; g++) e.pause[g] = 3;
    for (const gun of t.guns) {
      const g = gun.gun - 1;
      if (e.pause[g] !== 0) e.pause[g] -= 1;
      else if (e.inter[g] !== 0) e.inter[g] -= 1;
      else {
        if (e.left[g] === 0) {
          e.pause[g] = gun.salvo_pause;
          e.left[g] = gun.salvo;
        } else {
          enemyFire(w, i, gun.gun, 0);
          e.left[g] -= 1;
        }
        e.inter[g] = gun.inter;
      }
    }
  }
}

export function killEnemyShot(w: World, i: number): void {
  const s = w.enemyShots[i];
  s.active = false;
  w.spr.n[s.slot] = 0;
}

/** EnemyFire(enemy, gun, target) @0x15069: target 0 = a random living player for aimed patterns. */
export function enemyFire(w: World, i: number, gunNo: number, target: number): void {
  const e = w.enemies[i];
  const t = typeOf(w, e);
  const gun = t.guns.find((g) => g.gun === gunNo);
  if (!gun) return;
  if (gun.kind === 0xff) {
    // carrier launch (type 0x2E): spawn a fighter 0x2F after 12 ticks
    if (e.type === 0x2e) {
      startAnim(w, 0x16, e.slot);
      playSound(w, 0x2f);
      spawnEnemy(w, w.spr.x[e.slot] + gun.dx, w.spr.y[e.slot] + gun.dy, 0x2f, 3, 12);
    }
    return;
  }
  const kinds = w.data.tables.enemy_shot_kinds;
  for (let k = 1; k <= 49; k++) {
    const s = w.enemyShots[k];
    if (s.active) continue;
    // The original always takes the sound of gun 1's shot kind (and only if < 4 voices play)
    playSound(w, kinds[t.guns[0].kind - 1].sound, { belowVoices: 4 });
    s.active = true;
    s.slot = k + 71;
    s.pattern = gun.flugart;
    s.kind = gun.kind;
    w.spr.n[s.slot] = kinds[gun.kind - 1].sprite;
    w.spr.mode[s.slot] = 0;
    s.sx = w.spr.x[e.slot] + gun.dx;
    s.sy = w.spr.y[e.slot] + gun.dy;
    s.tx = 0;
    s.ty = 0;
    if (s.pattern > 4 && s.pattern < 7) {
      let p: Player | undefined;
      const [p1, p2] = w.players;
      if (target === 0) p = p1.active && p2.active ? (w.rng.next(2) === 0 ? p1 : p2) : p1.active ? p1 : p2.active ? p2 : undefined;
      else p = target === 1 && p1.active ? p1 : target === 2 && p2.active ? p2 : undefined;
      if (p) {
        const js = p.slots.jet;
        s.tx = w.spr.x[js] + (spriteW(w, w.spr.n[js]) >> 1);
        s.ty = w.spr.y[js];
        if (!w.scrolling) s.ty += spriteH(w, w.spr.n[js]) >> 1;
      } else killEnemyShot(w, k);
    }
    // TODO(slice): pattern 7 (rotating spray) and 22 (turret facing) set their targets here
    w.spr.x[s.slot] = s.sx;
    w.spr.y[s.slot] = s.sy;
    if (s.kind === 12) startAnim(w, 0x14, s.slot);
    if (s.kind === 24) startAnim(w, 0x20, s.slot);
    if (!w.players.some((q) => q.active)) killEnemyShot(w, k);
    return;
  }
}

/** MoveTowards @0x14F2C: the major axis steps by `speed`, the minor one is interpolated. */
function moveTowards(w: World, slot: number, speed: number, sx: number, sy: number, tx: number, ty: number): void {
  if (ty === sy) ty += 1;
  if (tx === sx) tx += 1;
  if (Math.abs(tx - sx) > Math.abs(ty - sy)) {
    w.spr.x[slot] += tx < sx ? -speed : speed;
    w.spr.y[slot] = sy + round(((ty - sy) * Math.abs(w.spr.x[slot] - sx)) / Math.abs(tx - sx));
  } else {
    w.spr.y[slot] += ty < sy ? -speed : speed;
    w.spr.x[slot] = sx + round(((tx - sx) * Math.abs(w.spr.y[slot] - sy)) / Math.abs(ty - sy));
  }
}

/** MoveEnemyShots @0x15671 (spec §7.5); enemy shots live in level coordinates. */
export function moveEnemyShots(w: World): void {
  const kinds = w.data.tables.enemy_shot_kinds;
  for (let k = 1; k <= 49; k++) {
    const s = w.enemyShots[k];
    if (!s.active) continue;
    const n = s.slot;
    const sp = kinds[s.kind - 1].speed;
    switch (s.pattern) {
      case 1: w.spr.y[n] += sp; break;
      case 2: w.spr.y[n] -= sp; break;
      case 3: w.spr.y[n] += sp; w.spr.x[n] += sp; break;
      case 4: w.spr.y[n] += sp; w.spr.x[n] -= sp; break;
      case 5:
        moveTowards(w, n, sp, s.sx, s.sy, s.tx, s.ty);
        break;
      case 8: w.spr.y[n] += Math.trunc(sp / 3); w.spr.x[n] += sp; break;
      case 9: w.spr.y[n] -= Math.trunc(sp / 3); w.spr.x[n] += sp; break;
      case 10: w.spr.y[n] += Math.trunc(sp / 3); w.spr.x[n] -= sp; break;
      case 11: w.spr.y[n] -= Math.trunc(sp / 3); w.spr.x[n] -= sp; break;
      case 12: w.spr.x[n] -= 4; break;
      case 13: w.spr.x[n] -= 4; w.spr.y[n] += 1; break;
      case 14: w.spr.x[n] -= 3; w.spr.y[n] += 2; break;
      case 15: w.spr.x[n] -= 3; w.spr.y[n] += 3; break;
      case 16: w.spr.y[n] += 4; break;
      case 18: w.spr.x[n] += sp; w.spr.y[n] += sp + 1; break;
      case 20: {
        w.spr.y[n] += sp;
        const p = nearestPlayer(w, n);
        if (p) w.spr.x[n] += centerX(w, n) < centerX(w, p.slots.jet) ? 2 : -2;
        break;
      }
      default:
        // TODO(slice): patterns 6 (homing), 7, 17, 19, 21, 22
        w.spr.y[n] += sp;
    }
    const x = w.spr.x[n], y = w.spr.y[n];
    if (w.scrollY + 200 < y || y < w.scrollY || 320 < x || x < 1) killEnemyShot(w, k);
  }
}

/** Nearest(2) @0x11055 (I: Manhattan distance between sprite positions; only used for homing here). */
function nearestPlayer(w: World, slot: number): Player | undefined {
  let best: Player | undefined;
  let bestD = Infinity;
  for (const p of w.players) {
    if (!p.active) continue;
    const d = Math.abs(w.spr.x[p.slots.jet] - w.spr.x[slot]) + Math.abs(w.spr.y[p.slots.jet] - w.spr.y[slot]);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/**
 * KillEnemy(drop, explode, i) @0x11A08: explosion by type, boss end, bonus drop (14 %), wreck.
 * drop/explode false = silent removal (despawn).
 */
export function killEnemy(w: World, i: number, drop: boolean, doExplode: boolean): void {
  const e = w.enemies[i];
  const t = typeOf(w, e);
  const high = e.layer === 1;
  if (doExplode) {
    const x = w.spr.x[e.slot], y = w.spr.y[e.slot];
    if (t.explosion_kind) {
      const k = t.explosion_kind;
      const rx = k.rnd ? w.rng.next(k.rnd) : 0;
      const ry = k.rnd ? w.rng.next(k.rnd) : 0;
      explode(w, x + k.dx + rx, y + k.dy + ry, k.kind, high);
    }
    if (t.kill_sound !== null) playSound(w, t.kill_sound);
    if (e.type === 0x2c) for (let n = 0; n < 3; n++) playSound(w, 0x30);
  }
  if (BOSS_TYPES.has(e.type)) {
    // the core's death ends the fight: level-end autopilot, every other active enemy vanishes
    w.autopilot = true;
    if (w.level === 4) {
      stopSound(w, 0x33);
      playSound(w, 0x32);
      playSound(w, 0x32);
    }
    for (let j = 1; j <= 29; j++) {
      const o = w.enemies[j];
      if (o.type === 0x48 || !o.active) continue;
      Object.assign(o, { active: false, dying: false, energy: 0 });
      w.spr.n[o.slot] = 0;
      w.spr.n[o.shadowSlot] = 0;
    }
  }
  // TODO(slice): type 0x0D calls BossScript(1) (level 2), the Golem 0x48 drifts off as sprite 1333 (sub 0x2A)
  w.spr.n[e.slot] = 0;
  w.spr.n[e.shadowSlot] = 0;
  e.active = false;
  e.dying = false;
  e.energy = 0;
  if (drop && t.reward > 0 && w.rng.next(100) + 1 < w.data.tables.bonus_drop.chance_below) {
    dropBonus(w, w.spr.x[e.slot], w.spr.y[e.slot], w.rng.next(100) + 1, t.reward);
  }
  if (doExplode && t.wreck !== 0) {
    const ws = i + 873;
    w.spr.x[ws] = w.spr.x[e.slot];
    w.spr.y[ws] = w.spr.y[e.slot];
    e.sub = BOSS_TYPES.has(e.type) ? 9 : 1;
    if ([0x3d, 0x3e, 0x3f, 0x44, 0x45, 0x46, 0x47].includes(e.type)) {
      w.spr.n[e.slot] = t.wreck;
      e.sub = 9;
    } else {
      w.spr.n[ws] = t.wreck;
      w.spr.mode[ws] = 0;
      e.slot = ws;
    }
    e.dying = true;
  }
}

/**
 * EnemyDestroyed(player, i, explode, drop) @0x12A1E: money, civilians' sound, then KillEnemy.
 * p = null: nobody gets the money (atom bomb).
 */
export function enemyDestroyed(w: World, p: Player | null, i: number, drop: boolean, doExplode: boolean): void {
  const e = w.enemies[i];
  const t = typeOf(w, e);
  if (!w.scrolling) drop = false;
  if (BOSS_TYPES.has(e.type)) {
    // a boss core's money is split; a player alone gets both halves
    const [p1, p2] = w.players;
    const half = Math.trunc(t.reward / 2);
    addMoney(w, p1.active ? p1 : p2, half);
    addMoney(w, p2.active ? p2 : p1, half);
  } else {
    if (p) addMoney(w, p, t.reward);
    if (t.reward < 0) playSound(w, 0x2d, { ifNotPlaying: true, copies: 3 });
  }
  // TODO(slice): a level 3 body segment (0x21) refills and calls BossScript(1) instead of dying
  killEnemy(w, i, drop, doExplode);
}
