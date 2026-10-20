// Enemies: spawning, movement subs, guns, enemy shots, kills (docs/gameplay-spec.md §6-7).

import type { EnemyType } from '../data';
import { clearBonuses, dropBonus } from './bonus';
import { bossScript } from './bosses';
import { clearExplosions, explode, startAnim } from './effects';
import { addMoney } from './player';
import { centerX, centerY, spriteH, spriteW } from './sprites';
import { FADE_STEPS, playSound, stopSound, type Enemy, type Player, type World } from './state';
import { cosDeg, div, mod, round, sinDeg } from './tp';
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

/** FireAllGuns(target, enemy) @0x16B91: scripted salvo from every gun of the enemy's class. */
export function fireAllGuns(w: World, i: number, target: number): void {
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
    case 0x15:
      e.c += 1;
      w.spr.y[s] += 3;
      if (e.c >= 1 && e.c <= 20) w.spr.x[s] += 3;
      else if (e.c >= 31 && e.c <= 50) w.spr.x[s] -= 3;
      else if (e.c === 61) e.c = 0;
      break;
    case 0x16:
    case 0x17:
      if (t >= 1 && t <= 35) w.spr.y[s] += 3;
      else if (t > 35 && t < 201) {
        w.spr.y[s] += 3;
        w.spr.x[s] += e.sub === 0x16 ? -2 : 2;
      }
      break;
    case 0x18:
      w.spr.y[s] += 1;
      w.spr.x[s] += 2;
      break;
    case 0x19: // ground vehicle that speeds up
      if (t > 20 && t < 150 && mod(t, div(t, 20)) === 0) {
        w.spr.x[s] += 3;
        w.spr.y[s] -= 1;
      }
      if (t > 200 && t < 500) {
        w.spr.x[s] += 3;
        w.spr.y[s] -= 1;
      }
      break;
    case 0x1a: // circles around x0, which creeps toward the nearest player (y0 is a level coordinate)
      w.spr.y[s] += 1;
      e.x0 += centerX(w, s) < centerX(w, nearestJet(w, s)) ? 1 : -1;
      w.spr.x[s] = e.x0 + round(5 * cosDeg(10 * t));
      w.spr.y[s] = e.y0 - round(5 * sinDeg(10 * t));
      break;
    case 0x1b: // pop-up turret
      w.spr.y[s] += 1;
      if (t === 50 || t === 150) startAnim(w, 0x17, s);
      else if (t === 66 || t === 166) fireAllGuns(w, i, 0);
      break;
    case 0x1c:
    case 0x1d: {
      w.spr.y[s] += 4;
      if (t === 16) startAnim(w, e.sub === 0x1c ? 0x18 : 0x19, s);
      const d = div((t - 16) * (t - 16), 10);
      if (t > 16) w.spr.x[s] = e.sub === 0x1c ? e.x0 - d : e.x0 + d;
      break;
    }
    case 0x1e:
      if (t < 36) w.spr.y[s] += 1;
      else {
        w.spr.x[s] += 1;
        w.spr.y[s] += 2;
      }
      break;
    case 0x1f:
      w.spr.x[s] += 1;
      w.spr.y[s] += 2;
      if (mod(t, 30) === 0) startAnim(w, 0x1b, s);
      if (t > 30 && mod(t - 12, 30) === 0) fireAllGuns(w, i, 0);
      break;
    case 0x20:
      if (mod(t - 4, 45) === 0) startAnim(w, 0x1c, s);
      if (mod(t - 30, 45) === 0) startAnim(w, 0x1d, s);
      w.spr.y[s] += 2;
      w.spr.x[s] = round(e.x0 + 60 * sinDeg(7 * t));
      break;
    case 0x21:
      w.spr.x[s] += 1;
      w.spr.y[s] += 2;
      break;
    case 0x23:
    case 0x24:
      w.spr.y[s] += 2;
      if (e.sub === 0x23 && t === 39) playSound(w, 0x18);
      else if (t === 40) startAnim(w, e.sub === 0x23 ? 0x22 : 0x21, s);
      else if (t > 40 && t < 78) w.spr.x[s] += e.sub === 0x23 ? -2 : 2;
      break;
    case 0x25: { // level 5 fortress part 0x45: follows the nearest player's x within 125..161
      if (centerX(w, s) < centerX(w, nearestJet(w, s))) {
        if (w.spr.x[s] < 161) w.spr.x[s] += 1;
      } else if (w.spr.x[s] > 125) w.spr.x[s] -= 1;
      break;
    }
    case 0x26: // launcher: a minion 0x31 at t mod 100 = 0 and 25
      if (mod(t, 100) === 0 || mod(t - 25, 100) === 0) {
        playSound(w, 0x2f);
        startAnim(w, 0x11, s);
        spawnEnemy(w, w.spr.x[s] + 10, w.spr.y[s] + 35, 0x31, 3, 10);
      }
      break;
    case 0x28: // falling rock (Golem)
      w.spr.y[s] += 7;
      break;
    case 0x29: // Golem laser: gone after 49 ticks
      if (t > 49) {
        e.active = false;
        e.dying = false;
        w.spr.n[s] = 0;
        e.energy = 0;
      }
      break;
    case 0x2a: // the dead Golem drifts off
      if (t === 2) {
        e.x0 = w.rng.next(5) - 2;
        e.y0 = -3;
      }
      w.spr.x[s] += e.x0;
      w.spr.y[s] += e.y0;
      break;
    case 7:
      levelTwoCoreAir(w, e);
      break;
    case 8:
      levelTwoCoreGround(w, e, i);
      break;
    case 0x12:
      snake(w, e);
      break;
    case 0x13: // debris: a line at 9 px/tick toward the target (energy, c); removed above the screen
      moveTowards(w, s, 9, e.x0, e.y0, e.energy, e.c);
      if (w.spr.y[s] < w.scrollY) killEnemy(w, i, false, false);
      break;
    case 0x22:
      tankCore(w, e);
      break;
    case 0x27:
      golemScript(w, e);
      break;
  }
}

/** Sub 7, level 2 core in the air: loops of radius 50 left and right of the start, then maybe a swoop. */
function levelTwoCoreAir(w: World, e: Enemy): void {
  const s = e.slot;
  if (e.phase === 1) {
    e.c -= 5;
    w.spr.x[s] = e.x0 - 50 + round(50 * cosDeg(e.c));
    w.spr.y[s] = e.y0 - round(50 * sinDeg(e.c));
    if (e.c < -360) {
      e.phase = 2;
      e.c = 180;
    }
  } else if (e.phase === 2) {
    e.c += 5;
    w.spr.x[s] = e.x0 + 50 + round(50 * cosDeg(e.c));
    w.spr.y[s] = e.y0 - round(50 * sinDeg(e.c));
    if (e.c > 540) {
      e.phase = w.rng.next(2) === 0 ? 3 : 1;
      e.c = 0;
    }
  } else if (e.phase === 3) {
    e.c += 1;
    const c = e.c;
    if (c >= 0 && c <= 30) {
      w.spr.x[s] -= 2;
      w.spr.y[s] += 2;
    } else if (c >= 31 && c <= 60) w.spr.x[s] += 4;
    else if (c >= 61 && c <= 90) {
      w.spr.x[s] -= 2;
      w.spr.y[s] -= 2;
    } else if (c === 121) {
      e.phase = 1;
      e.c = 0;
    }
  }
}

/** Sub 8, level 2 core on the ground (BossScript(2, 1) switches to it): zig-zags, eggs, strafing runs. */
function levelTwoCoreGround(w: World, e: Enemy, i: number): void {
  const s = e.slot;
  e.c += 1;
  const c = e.c;
  if (e.phase === 0) {
    if (c === 40) e.phase = 1;
  } else if (e.phase === 1) {
    moveTowards(w, s, 2, e.x0, e.y0, 4, w.scrollY + 4);
    if (w.spr.x[s] < 8 && w.spr.y[s] < w.scrollY + 8) {
      e.phase = 2;
      e.c = 1;
    }
  } else if (e.phase === 2) {
    if (c >= 1 && c <= 30) {
      w.spr.x[s] += 2;
      w.spr.y[s] += 2;
    } else if (c >= 31 && c <= 60) {
      w.spr.x[s] += 2;
      w.spr.y[s] -= 2;
    } else if (c >= 61 && c <= 100) {
      if (mod(c, 5) === 0) spawnEnemy(w, w.spr.x[s] + 15, w.spr.y[s] + 40, 0x0e, 3);
    } else if (c >= 101 && c <= 130) {
      w.spr.x[s] += 2;
      w.spr.y[s] += 2;
    } else if (c >= 131 && c <= 160) {
      w.spr.x[s] += 2;
      w.spr.y[s] -= 2;
    } else if (c === 161) {
      e.phase = 3;
      e.c = 10;
    }
  } else if (e.phase === 3) {
    w.spr.x[s] -= 3;
    if (mod(e.c, 20) === 0) fireAllGuns(w, i, 0);
    if (w.spr.x[s] < 8) {
      e.phase = 2;
      e.c = 1;
    }
  }
}

/** Sub 0x12, the level 3 snake (all five parts run the same path; the arcs are 8 degrees per tick). */
function snake(w: World, e: Enemy): void {
  const s = e.slot;
  const cy = w.scrollY + 50;
  switch (e.phase) {
    case 1:
      w.spr.y[s] += 2;
      if (w.spr.y[s] > cy) e.phase = 2;
      break;
    case 2: arc(w, e, e.x0 - 30, cy, 30, -6, 0, -180, 3); break;
    case 3: arc(w, e, e.x0 - 90, cy, 30, 6, 0, 180, 4); break;
    case 4: arc(w, e, e.x0 - 20, cy, 100, 6, 180, 270, 5); break;
    case 5:
      w.spr.x[s] += 4;
      if (e.x0 <= w.spr.x[s]) e.phase = 6;
      break;
    case 6: arc(w, e, e.x0, w.scrollY + 110, 40, 6, -90, 270, 7); break;
    case 7:
      w.spr.x[s] += 4;
      if (e.x0 + 20 <= w.spr.x[s]) e.phase = 8;
      break;
    case 8: arc(w, e, e.x0 + 20, cy, 100, 6, -90, 0, 9); break;
    case 9: arc(w, e, e.x0 + 90, cy, 30, 6, 0, 180, 10); break;
    case 10: arc(w, e, e.x0, cy, 60, -6, 0, -540, 3); break;
  }
}

/** Sub 0x22, the level 4 tank core: a rectangle with the hatch opening and closing (anims, sound 52). */
function tankCore(w: World, e: Enemy): void {
  const s = e.slot;
  const t = e.t;
  const hatch = (anim: number) => {
    startAnim(w, anim, s);
    playSound(w, 0x34);
  };
  if (t === 2) hatch(0x1e);
  // Original bug (spec §12 #9): the first leg ran 31 ticks (20-50), so the tank drifted 2 px left per loop.
  else if (t >= 21 && t <= 50) w.spr.x[s] -= 2;
  else if (t === 51) hatch(0x1f);
  else if (t >= 71 && t <= 100) w.spr.y[s] += 2;
  else if (t >= 121 && t <= 150) w.spr.y[s] -= 2;
  else if (t === 151) hatch(0x1e);
  else if (t >= 171 && t <= 200) w.spr.x[s] += 2;
  else if (t === 201) hatch(0x1f);
  else if (t >= 221 && t <= 250) w.spr.y[s] += 2;
  else if (t === 251) hatch(0x1e);
  else if (t >= 271 && t <= 320) w.spr.x[s] += 2;
  else if (t === 321) hatch(0x1f);
  else if (t >= 341 && t <= 370) w.spr.y[s] -= 2;
  else if (t === 371) hatch(0x1e);
  else if (t >= 391 && t <= 440) w.spr.x[s] -= 2;
  else if (t === 461) e.t = 3;
}

/** Golem attack chooser @0x16BF1: states 2-5. */
function golemAttack(w: World): number {
  return w.rng.next(4) + 2;
}

/** Sub 0x27, the Golem (level 6): intro with the curse, then random attacks (BossScript actions). */
function golemScript(w: World, e: Enemy): void {
  const s = e.slot;
  e.c += 1;
  const c = e.c;
  const next = () => {
    e.c = 0;
    e.phase = golemAttack(w);
  };
  switch (e.phase) {
    case 1: // intro: roar, curse
      if (c === 60) {
        for (let k = 0; k < 3; k++) playSound(w, 0x35);
        playSound(w, 0x14);
        playSound(w, 0x14);
        startAnim(w, 0x27, s);
      }
      if (c === 150) bossScript(w, 4);
      if (c === 250) {
        e.c = 0;
        e.phase = 2;
      }
      break;
    case 2: // teleport
      if (c === 1) bossScript(w, 1);
      if (c === 200) bossScript(w, 2);
      if (c === 280) next();
      break;
    case 3: // rocks
      if (c === 1) bossScript(w, 3);
      if (c === 100) next();
      break;
    case 4: { // bounce inside x -60..180, y scrollY-50..scrollY+90 (x0/y0 hold the velocity)
      const lo = w.scrollY - 50, hi = w.scrollY + 90;
      if (c === 1) {
        bossScript(w, 6);
        playSound(w, 0x1f, { loop: true });
        playSound(w, 0x1f, { loop: true });
      }
      if (c === 25) {
        e.x0 = 2;
        e.y0 = 2;
        w.spr.x[s] = Math.min(Math.max(w.spr.x[s], -60), 180);
        w.spr.y[s] = Math.min(Math.max(w.spr.y[s], lo), hi);
      }
      if (c > 25 && c < 400) {
        w.spr.x[s] += e.x0;
        w.spr.y[s] += e.y0;
        if (w.spr.x[s] < -60 || w.spr.x[s] > 180) e.x0 = -e.x0;
        if (w.spr.y[s] < lo || w.spr.y[s] > hi) e.y0 = -e.y0;
      }
      if (c === 400) bossScript(w, 8);
      if (c === 430) {
        next();
        stopSound(w, 0x1f);
        stopSound(w, 0x1f);
      }
      break;
    }
    case 5: // two laser beams
      if (c === 1 || c === 44) bossScript(w, 7);
      if (c === 5 || c === 48) startAnim(w, 0x2a, s);
      if (c === 180) next();
      break;
  }
}

/** Snake sprites face their movement: base sprite + Direction8. */
const SNAKE_SPRITE: Record<number, number> = { 0x20: 0x3d8, 0x21: 0x3e0, 0x22: 0x3d0 };
/** Turrets face the nearest player: base sprite + Direction8. */
const TURRET_SPRITE: Record<number, number> = { 0x3d: 0x4d1, 0x46: 0x4fc };

/** EnemyUpdate @0x16C0E: scroll, movement sub, despawn, then the per-type hooks (spec §7.2). */
export function enemyUpdate(w: World): void {
  for (let i = 1; i <= 29; i++) {
    const e = w.enemies[i];
    if (e.active || e.dying) {
      const ox = w.spr.x[e.slot], oy = w.spr.y[e.slot];
      if (w.scrolling) w.spr.y[e.slot] -= 1;
      e.t += 1;
      moveSub(w, e, i);
      const y = w.spr.y[e.slot], x = w.spr.x[e.slot];
      const exempt = BOSS_TYPES.has(e.type) || e.type === 0x4a;
      if (!exempt && (w.scrollY + 200 <= y || x < w.scrollX - 50 || w.scrollX + 370 < x)) killEnemy(w, i, false, false);
      typeHooks(w, e, i, ox, oy);
    } else if (e.energy > 0) {
      e.energy -= 1;
      if (e.energy === 0) spawnEnemy(w, e.x0, e.y0, e.type, e.sub);
    }
  }
}

/** EnemyUpdate's hooks by type, after the movement; (ox, oy) is the position before this tick. */
function typeHooks(w: World, e: Enemy, i: number, ox: number, oy: number): void {
  const s = e.slot;
  const x = w.spr.x[s], y = w.spr.y[s];
  if (e.type === 0x05) bossScript(w, 2);
  if (e.type === 0x20 && mod(e.t, 3) === 0) {
    // snake head: aimed fire at each player who lies in the direction the head is moving
    const move = direction8(ox, oy, x, y);
    for (const p of w.players) {
      const jet = p.slots.jet;
      if (p.active && direction8(x, y, w.spr.x[jet], w.spr.y[jet]) === move) fireAllGuns(w, i, p.index + 1);
    }
  }
  // Original bug (spec §12 #17): the facing ran on records the despawn had just removed, so a snake piece
  // removed at the screen edge could leave its sprite behind.
  if (SNAKE_SPRITE[e.type] !== undefined && mod(e.t, 3) === 0 && (e.active || e.dying)) {
    w.spr.n[s] = SNAKE_SPRITE[e.type] + direction8(ox, oy, x, y);
  }
  if (e.type === 0x3c) bossScript(w, 1);
  if (e.active && TURRET_SPRITE[e.type] !== undefined) {
    const jet = nearestJet(w, s);
    w.spr.n[s] = TURRET_SPRITE[e.type] + direction8(x, y, w.spr.x[jet], w.spr.y[jet]);
  }
}

// Direction8's slope thresholds: the Real constants 2.414 and 0.414 (tan 67.5° and tan 22.5°).
const STEEP = 2.4140000000006694;
const FLAT = 0.41400000000021464;

/** Direction8 @0x167E5: from (x, y) toward (tx, ty): 0 up, 1 up-right, 2 right, ... 7 up-left. */
export function direction8(x: number, y: number, tx: number, ty: number): number {
  const dx = tx - x, up = y - ty;
  if (dx === 0) return up < 0 ? 4 : 0;
  const r = up / dx;
  const d = r > STEEP ? 0 : r > FLAT ? 1 : r > -FLAT ? 2 : r > -STEEP ? 3 : 4;
  return dx > 0 ? d : mod(d + 4, 8);
}

/**
 * Nearest(2, y, x) @0x11055: the player whose jet's top-left is nearest (Manhattan) to (x, y); 1 or 2, 2 on a
 * tie, 0 when nobody is active.
 */
function nearestPlayerNo(w: World, x: number, y: number): number {
  const [p1, p2] = w.players;
  if (p1.active !== p2.active) return p1.active ? 1 : 2;
  if (!p1.active) return 0;
  const d = (p: Player) => Math.abs(x - w.spr.x[p.slots.jet]) + Math.abs(y - w.spr.y[p.slots.jet]);
  return d(p1) < d(p2) ? 1 : 2;
}

/** The callers' use of Nearest(2) from a sprite's centre: P1's jet slot for 1, else P2's. */
function nearestJet(w: World, slot: number): number {
  return w.players[nearestPlayerNo(w, centerX(w, slot), centerY(w, slot)) === 1 ? 0 : 1].slots.jet;
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
    if (s.pattern === 7) {
      // rotating spray: a target 50 px from the gun, turning 4 degrees per enemy tick
      s.tx = s.sx + round(50 * cosDeg(4 * e.t));
      s.ty = s.sy - round(50 * sinDeg(4 * e.t));
    }
    if (s.pattern === 22) s.sx = w.spr.n[e.slot] - t.sprite; // the turret's facing (Direction8)
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
      case 6: { // homing: re-aimed from where it is at the nearest jet's centre every tick
        s.sx = w.spr.x[n];
        s.sy = w.spr.y[n];
        const jet = nearestJet(w, n);
        s.tx = centerX(w, jet);
        s.ty = centerY(w, jet);
        moveTowards(w, n, sp, s.sx, s.sy, s.tx, s.ty);
        break;
      }
      case 5:
      case 7:
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
      case 17: { // clockwise arc of radius 200 from the gun, 2 degrees per tick (tx = angle - 90)
        s.tx -= 2;
        const a = s.tx + 90;
        w.spr.x[n] = s.sx + round(200 * cosDeg(a));
        w.spr.y[n] = s.sy + 200 - round(200 * sinDeg(a));
        break;
      }
      case 18: w.spr.x[n] += sp; w.spr.y[n] += sp + 1; break;
      case 19:
        // falling, ty = speed (0, 1, ... 9). Nothing advances tx, so `tx = 1` never holds and the speed
        // grows every tick (I: a counter for "every 8th tick" was probably intended; kept as shipped)
        if (s.tx === 1) s.ty = 2;
        w.spr.y[n] += s.ty;
        if (mod(s.tx, 8) === 0 && s.ty < 9) s.ty += 1;
        break;
      case 20:
        w.spr.y[n] += sp;
        w.spr.x[n] += centerX(w, n) < centerX(w, nearestJet(w, n)) ? 2 : -2;
        break;
      case 21: { // level 4 beam, glued to enemy record 4 (the gun 0x3E) for 23 ticks
        s.tx += 1;
        const g = w.enemies[4].slot;
        w.spr.x[n] = w.spr.x[g] + 13;
        w.spr.y[n] = w.spr.y[g] + 37;
        if (s.tx > 23) killEnemyShot(w, k);
        break;
      }
      case 22: { // 8 ways by the turret's facing sx: orthogonal by s, diagonal by s - 2 on both axes
        const d = sp - 2;
        const [dx, dy] = [[0, -sp], [d, -d], [sp, 0], [d, d], [0, sp], [-d, d], [-sp, 0], [-d, -d]][s.sx];
        w.spr.x[n] += dx;
        w.spr.y[n] += dy;
        break;
      }
    }
    const x = w.spr.x[n], y = w.spr.y[n];
    if (w.scrollY + 200 < y || y < w.scrollY || 320 < x || x < 1) killEnemyShot(w, k);
  }
}

/**
 * Nearest(1, y, x) @0x11055: the active enemy (wrecks are inactive) that pays positive money with the
 * smallest Manhattan distance from (x, y) to its sprite's top-left corner, below 1000; 0 = none.
 */
export function nearestEnemy(w: World, x: number, y: number): number {
  let best = 0;
  let bestD = 1000;
  for (let i = 1; i <= 29; i++) {
    const e = w.enemies[i];
    if (!e.active || typeOf(w, e).reward <= 0) continue;
    const d = Math.abs(x - w.spr.x[e.slot]) + Math.abs(y - w.spr.y[e.slot]);
    if (d < bestD) {
      best = i;
      bestD = d;
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
  if (e.type === 0x0d) bossScript(w, 1);
  if (e.type === 0x48) {
    // the dead Golem drifts off as sprite 1333
    w.spr.n[e.slot] = 0x535;
    e.sub = 0x2a;
    e.t = 0;
    // Original bug (spec §12 #18): it stayed an active enemy, so every further hit (or ramming) in the
    // same tick destroyed it again and paid its 30000 again. The remake lets it drift like a wreck.
    e.active = false;
    e.dying = true;
  } else {
    w.spr.n[e.slot] = 0;
    w.spr.n[e.shadowSlot] = 0;
    e.active = false;
    e.dying = false;
    e.energy = 0;
  }
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
  if (e.type === 0x21) {
    // a level 3 body segment is refilled and the last one flies off instead (BossScript(3, 1))
    // Original bug (spec §12 #19): the refill ignored the two-player bonus (×1.5) SpawnEnemy gives.
    e.energy = t.energy + (w.twoPlayer ? round(t.energy / 2) : 0);
    bossScript(w, 1);
  } else killEnemy(w, i, drop, doExplode);
}
