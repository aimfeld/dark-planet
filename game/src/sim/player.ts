// Player input, movement, damage, death and respawn (docs/gameplay-spec.md §2-3).

import { explode } from './effects';
import { LOW_SLOT_SHIFT, playSound, shiftSlots, stopSound, type Player, type PlayerInput, type World } from './state';
import { mod, round } from './tp';

export const LIVES_TEXT = [813, 814]; // text sprites (07a4)
export const DIGIT_TEXT = [815, 816];
export const MONEY_TEXT = [837, 838];
// HUD sprite slots (LevelStartSprites @0x107F8); slots 0-8 are drawn without the playfield clip
export const HUD = { icon: [1, 2], lives: [3, 4], money: [5, 6], frameRight: 7, frameLeft: 8 };

function jetOf(w: World, p: Player) {
  return w.data.tables.jets[p.jet - 1];
}

/** Keyboard handler @0x1A1DD: altitude toggle on press, velocity decay every 4th tick. */
export function keyboardInput(w: World, p: Player, k: PlayerInput): void {
  p.fire = k.fire;
  p.selectKey = k.bonus; // Space
  p.useKey = k.bonus && k.fire; // Ctrl + Space
  if (!k.altitude) p.altLatch = false;
  else {
    if (!p.altLatch && p.pendingSwap === 0) {
      p.high = !p.high;
      p.pendingSwap = p.high ? 1 : 2;
    }
    p.altLatch = true;
  }
  if (!k.left && !k.right && mod(w.frame, 4) === 0) {
    if (p.vx > 0) p.vx -= 1;
    if (p.vx < 0) p.vx += 1;
  }
  if (!k.up && !k.down && mod(w.frame, 4) === 0) {
    if (p.vy > 0) p.vy -= 1;
    if (p.vy < 0) p.vy += 1;
  }
}

/** Movement @0x1A73E: accelerate, move inside the bounds, pick the banking frame. */
export function movePlayer(w: World, p: Player, k: PlayerInput): void {
  const t = w.data.tables;
  const max = p.engine === 0 ? t.no_engine_max_speed : t.engines[p.engine - 1].max_speed;
  if (k.left && -max < p.vx) p.vx -= 1;
  if (k.right && p.vx < max) p.vx += 1;
  if (k.up && -max < p.vy) p.vy -= 1;
  if (k.down && p.vy < max) p.vy += 1;

  const jet = jetOf(w, p);
  const e = jet.extents;
  const s = p.slots.jet;
  const x = w.spr.x[s], y = w.spr.y[s];
  if ((12 < e.l + x || p.vx >= 0) && (e.r + x < 308 || p.vx < 1)) w.spr.x[s] = x + p.vx;
  const heliRoom = p.jet === 4 && t.jets[3].extents.b + y < w.scrollY + 220;
  if ((w.scrollY + 10 < e.t + y || p.vy >= 0) && (e.b + y < w.scrollY + 190 || heliRoom || p.vy < 1)) w.spr.y[s] = y + p.vy;

  const bank = round((3 * p.vx) / max);
  w.spr.n[s] = p.jet === 4 ? t.jets[3].frame_base + 6 + 2 * bank : jet.frame_base + 3 + bank;
}

/** AltitudeSwap @1d9e:25B7: move the player's 24 sprite slots to the other range (draw order). */
export function altitudeSwap(w: World, p: Player): void {
  const base = p.index === 0 ? 124 : 249;
  const [to, from] = p.pendingSwap === 1 ? [base, base + LOW_SLOT_SHIFT] : [base + LOW_SLOT_SHIFT, base];
  p.pendingSwap = 0;
  for (let i = 1; i <= 24; i++) {
    w.spr.n[to + i] = w.spr.n[from + i];
    w.spr.x[to + i] = w.spr.x[from + i];
    w.spr.y[to + i] = w.spr.y[from + i];
    w.spr.mode[to + i] = w.spr.mode[from + i];
  }
  for (let i = 1; i <= 24; i++) w.spr.n[from + i] = 0;
  const d = to - from;
  for (const a of w.anims) if (a.state !== 0 && a.slot >= from + 1 && a.slot <= from + 24) a.slot += d;
  p.slots = shiftSlots(p.slots, d);
}

/** Damage to the shield first, the rest to life (spec §3.4). */
export function damage(p: Player, d: number): void {
  p.shield -= d;
  if (p.shield < 0) {
    p.life += p.shield;
    p.shield = 0;
  }
}

export function setLivesText(w: World, p: Player): void {
  w.texts.set(LIVES_TEXT[p.index], String(p.lives));
}

/** AddMoney @1d9e:0D0E: doubled in two-player games, never below 0. */
export function addMoney(w: World, p: Player, amount: number): void {
  p.money += w.twoPlayer ? amount * 2 : amount;
  if (p.money < 0) p.money = 0;
  w.texts.set(MONEY_TEXT[p.index], '$' + p.money);
}

/** InvulnerabilityStart @0x1055F. */
export function startInvulnerable(w: World, p: Player, ticks: number): void {
  p.invCounter = ticks;
  p.invulnerable = true;
  playSound(w, 16, { loop: true, ifNotPlaying: true });
  for (let i = 0; i < 3; i++) playSound(w, 44);
}

/** Invulnerability tick @0x10637: arc sprite 544 and a countdown digit above the jet. */
export function invulnerableTick(w: World, p: Player): void {
  const jet = jetOf(w, p);
  const cx = jet.extents.l + ((jet.extents.r - jet.extents.l) >> 1);
  if (p.invCounter > 0) {
    if (mod(p.invCounter, 20) === 0) {
      w.spr.n[p.slots.arc] = 544;
      w.spr.n[p.slots.digit] = DIGIT_TEXT[p.index];
      w.texts.set(DIGIT_TEXT[p.index], String(Math.trunc(p.invCounter / 20)));
    }
    p.invCounter -= 1;
    const x = w.spr.x[p.slots.jet], y = w.spr.y[p.slots.jet];
    w.spr.x[p.slots.arc] = x + cx - 21;
    w.spr.y[p.slots.arc] = y + jet.extents.t - 8;
    w.spr.x[p.slots.digit] = x + cx - 5;
    w.spr.y[p.slots.digit] = y + jet.extents.t - 25;
  }
  if (p.invCounter < 1 && p.invulnerable) endInvulnerable(w, p);
}

/** InvulnerabilityEnd @0x105CA (the loop sound 16 is shared: it stops even if the other player is still covered). */
function endInvulnerable(w: World, p: Player): void {
  for (let i = 0; i < 3; i++) playSound(w, 43);
  p.invulnerable = false;
  w.spr.n[p.slots.arc] = 0;
  w.spr.n[p.slots.digit] = 0;
  p.invCounter = 0;
  stopSound(w, 16);
}

/** LifeLost @0x10FA3: explosion, back to (150, below the screen), refill, one ship less. */
export function lifeLost(w: World, p: Player): void {
  const s = p.slots.jet;
  const ex = w.spr.x[s] - 80 + w.rng.next(30);
  const ey = w.spr.y[s] - 80 + w.rng.next(30);
  explode(w, ex, ey, 9, true);
  w.spr.y[s] = w.scrollY + 300;
  w.spr.x[s] = 150;
  p.flyIn = true;
  p.life = jetOf(w, p).max_life;
  if (p.shieldType > 0) p.shield = w.data.tables.shields[p.shieldType - 1].max;
  p.lives -= 1;
  setLivesText(w, p);
  startInvulnerable(w, p, 100);
}

/** RespawnFlyIn @0x10742: 3 px up per tick until the jet's bottom is on screen. */
export function respawnFlyIn(w: World, p: Player): void {
  const s = p.slots.jet;
  w.spr.y[s] -= 3;
  const t = w.data.tables;
  if (jetOf(w, p).extents.b + w.spr.y[s] < w.scrollY + 200 || (p.jet === 4 && t.jets[3].extents.b + w.spr.y[s] < w.scrollY + 220)) {
    p.flyIn = false;
  }
}

/** ShieldRecharge @0x10F30. */
export function shieldRecharge(w: World, p: Player): void {
  if (p.shield < 0) p.shield = 0;
  if (p.shieldType === 0) return;
  const sh = w.data.tables.shields[p.shieldType - 1];
  if (mod(w.frame, sh.recharge_every) === 0) {
    p.shield += 1;
    if (p.shield > sh.max) p.shield = sh.max;
  }
}

/**
 * PlayerOut @0x10D24 (lives < 0): the player leaves the game (ship, pods, shadows, label, inventory, shots
 * removed; the lives number becomes "Loser!" under the money); both out starts the game-over countdown.
 */
export function playerOut(w: World, p: Player): void {
  const s = p.slots;
  p.active = false;
  for (let m = 0; m < 8; m++) {
    w.spr.n[s.pods + m] = 0;
    w.spr.n[s.podShadows + m] = 0;
  }
  w.spr.n[s.jet] = 0;
  w.spr.n[s.shadow] = 0;
  w.spr.n[s.label] = 0;
  for (let i = 0; i < 3; i++) {
    p.bonus[i] = 0;
    w.spr.n[s.inv + i] = 0;
  }
  for (const shot of p.shots) {
    if (shot.active) w.spr.n[shot.slot] = 0;
    shot.active = false;
  }
  w.spr.n[s.selFrame] = 0;
  if (p.invulnerable) endInvulnerable(w, p);
  p.life = 0;
  p.shield = 0;
  w.texts.set(LIVES_TEXT[p.index], 'Loser!');
  w.spr.x[HUD.lives[p.index]] = w.spr.x[HUD.money[p.index]];
  w.spr.n[HUD.icon[p.index]] = 0;
  if (!w.players.some((q) => q.active)) w.gameOver = 120;
}
