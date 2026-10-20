// Bonuses: drops, wobbling bonus objects, pickups, the 3-slot inventory and the bonus effects
// (docs/gameplay-spec.md §5; DropBonus 1d9e:0F5D/0DC1, wobble 1d9e:0BE2, PickupBonuses 0x1330C,
// BonusInventory 0x13534, UseBonus 0x12CA2, BombTimer 0x12C03).

import { explode, quake } from './effects';
import { enemyDestroyed } from './enemies';
import { addMoney, setLivesText, startInvulnerable } from './player';
import { hitDetect } from './sprites';
import { playSound, type Player, type World } from './state';
import { cosDeg, round, sinDeg } from './tp';
import { killShot, nose, spawnShot } from './weapons';

export const LABEL = 0xff; // a bonus record showing the "+1000" label
const SLOT = 21; // bonus i (1..10) uses sprite slot 21 + i
const LABEL_SPRITE = [567, 572]; // "+1000", "+2000" (two players: AddMoney doubles)
const SELECTION_FRAME = 492;
const X5_ICON = 464;
export const HUD_X = [25, 210]; // inventory slots at HUD_X + 30 i (+ the item's offset)

/** Bonus position from the frame counter: a radius-5 circle at 7 degrees per tick (1d9e:0DC1 / 0BE2). */
function place(w: World, i: number): void {
  const b = w.bonuses[i];
  const a = 7 * w.frame;
  w.spr.x[SLOT + i] = b.x0 + round(5 * cosDeg(a));
  w.spr.y[SLOT + i] = b.y0 - round(5 * sinDeg(a));
}

/** RemoveBonus 1d9e:0D97 (a label keeps its kind until its countdown ends). */
function remove(w: World, i: number): void {
  w.bonuses[i].active = false;
  w.spr.n[SLOT + i] = 0;
}

/**
 * DropBonus(x, y, roll, reward) 1d9e:0F5D: the kind for roll (1..100) from the threshold table, in the
 * first free record. Roll 100 gives nothing.
 */
export function dropBonus(w: World, x: number, y: number, roll: number, reward: number): void {
  const t = w.data.tables.bonus_drop.thresholds; // [55, 60, ..., 100]
  let kind = 1;
  while (kind <= t.length && t[kind - 1] <= roll) kind++;
  if (kind > 10) return;
  for (let i = 1; i <= 10; i++) {
    const b = w.bonuses[i];
    if (b.active || b.kind === LABEL) continue;
    Object.assign(b, { active: true, kind, x0: x, y0: y, timer: reward });
    w.spr.n[SLOT + i] = w.data.tables.boni[kind - 1].sprite;
    w.spr.mode[SLOT + i] = 0;
    place(w, i);
    return;
  }
}

/** Game loop @0x1BA9C..0x1BB0A: wobble every 2nd tick, label countdowns, x5 timers. */
export function bonusTimers(w: World): void {
  w.wobbleCounter -= 1;
  if (w.wobbleCounter < 1) {
    for (let i = 1; i <= 10; i++) {
      const b = w.bonuses[i];
      if (!b.active && b.kind !== LABEL) continue;
      place(w, i);
      if (w.scrollY + 210 < w.spr.y[SLOT + i]) remove(w, i);
    }
    w.wobbleCounter = 2;
  }
  for (let i = 1; i <= 10; i++) {
    const b = w.bonuses[i];
    if (b.kind !== LABEL) continue;
    b.timer -= 1;
    if (b.timer < 1) {
      b.kind = 0;
      remove(w, i);
    }
  }
  for (const p of w.players) {
    if (p.x5Timer === 0) continue;
    p.x5Timer -= 1;
    if (p.x5Timer === 0) w.spr.n[p.slots.x5] = 0;
  }
}

/** Remove every bonus object (StartBossFight, level start). */
export function clearBonuses(w: World): void {
  for (let i = 1; i <= 10; i++) remove(w, i);
}

function jetCenterY(w: World, p: Player): number {
  const e = w.data.tables.jets[p.jet - 1].extents;
  return e.t + ((e.b - e.t) >> 1); // 1d9e:13BF
}

/** UseBonus(kind, jet) @0x12CA2. Bonus shots use mount -1/-2 (they belong to no pod). */
export function useBonus(w: World, p: Player, kind: number): void {
  const t = w.data.tables;
  const [cx] = nose(w, p);
  const jet = p.slots.jet;
  switch (kind) {
    case 1:
      addMoney(w, p, 1000);
      break;
    case 2: // atom bomb: a slow projectile, explodes after 80 ticks (MoveShots pattern 13)
      killShot(w, p, 47);
      spawnShot(w, p, -1, { type: 12, pattern: 13, dx: 0, dy: 0 }, cx - 3, 0);
      playSound(w, 15);
      break;
    case 3:
      startInvulnerable(w, p, 200);
      break;
    case 4:
      p.lives += 1;
      setLivesText(w, p);
      break;
    case 5: // Blast: clears the own shots, then a ring of 20 spiral shots at random angles
      playSound(w, 31);
      for (let i = 0; i <= 47; i++) killShot(w, p, i);
      for (let i = 1; i <= 20; i++) spawnShot(w, p, -1, { type: 10, pattern: 11, dx: 0, dy: 0 }, 0, 0);
      break;
    case 6: // Death: kills every active enemy (boss fight: -150 each); the user gets the money, no drops
      explode(w, w.spr.x[jet], w.spr.y[jet], 12, false);
      for (let i = 1; i <= 29; i++) {
        const e = w.enemies[i];
        if (!e.active) continue;
        if (w.scrolling) e.energy = 0;
        else e.energy -= 150;
        if (e.energy < 1) enemyDestroyed(w, p, i, false, true);
      }
      playSound(w, 14);
      quake(w, 50); // (plays sound 14 a second time, as in the original)
      break;
    case 7: // Twin-Laser: two sine shots in opposite phase
      killShot(w, p, 46);
      killShot(w, p, 47);
      spawnShot(w, p, -1, { type: 11, pattern: 12, dx: 0, dy: 0 }, cx, 0);
      spawnShot(w, p, -2, { type: 11, pattern: 12, dx: 0, dy: 0 }, cx, 0);
      playSound(w, 11);
      break;
    case 8: { // Aid: +40 % of the maximum life and shield
      const maxLife = t.jets[p.jet - 1].max_life;
      const maxShield = p.shieldType > 0 ? t.shields[p.shieldType - 1].max : 0;
      p.life = Math.min(p.life + round((maxLife / 100) * 40), maxLife);
      p.shield = Math.min(p.shield + round((maxShield / 100) * 40), maxShield);
      playSound(w, 20);
      break;
    }
    case 9: // Star: 5 shots orbiting outward, 72 degrees apart
      for (let i = 42; i <= 47; i++) killShot(w, p, i);
      for (let i = 0; i < 5; i++) {
        const s = spawnShot(w, p, -1, { type: 22, pattern: 22, dx: 0, dy: 0 }, cx, 0);
        if (s) s.tx = 72 * i;
      }
      playSound(w, 20);
      break;
    case 10: // pentagram: x5 damage for 666 ticks, icon over the jet (follows it in ScrollStep)
      p.x5Timer = 666;
      w.spr.n[p.slots.x5] = X5_ICON;
      w.spr.x[p.slots.x5] = w.spr.x[jet] + cx - 12;
      w.spr.y[p.slots.x5] = w.spr.y[jet] + jetCenterY(w, p) - 12;
      break;
  }
}

/** ScrollStep @0x15F68 tail: the x5 icon follows the jet. */
export function x5IconFollow(w: World, p: Player): void {
  if (w.spr.n[p.slots.x5] === 0) return;
  const jet = p.slots.jet;
  w.spr.x[p.slots.x5] = w.spr.x[jet] + nose(w, p)[0] - 12;
  w.spr.y[p.slots.x5] = w.spr.y[jet] + jetCenterY(w, p) - 12;
}

/** HUD positions of the inventory (BonusInventory tail; also at level start @0x107F8). */
export function placeInventory(w: World, p: Player): void {
  const boni = w.data.tables.boni;
  for (let i = 0; i < 3; i++) {
    const k = p.bonus[i];
    const s = p.slots.inv + i;
    if (k === 0) continue;
    w.spr.n[s] = boni[k - 1].sprite;
    w.spr.x[s] = 30 * i + HUD_X[p.index] + boni[k - 1].hud_offset;
    w.spr.y[s] = w.scrollY + 171;
  }
}

/** BonusInventory @0x13534: use / select on press, compact to the left, HUD sprites and selection frame. */
export function bonusInventory(w: World, p: Player): void {
  const inv = p.bonus;
  if (p.useKey && !p.bonusLatch && inv[p.selected] !== 0) {
    p.bonusLatch = true;
    useBonus(w, p, inv[p.selected]);
    w.spr.n[p.slots.inv + p.selected] = 0;
    inv[p.selected] = 0;
    p.selected = Math.max(0, p.selected - 1);
  }
  if (p.selectKey && !p.bonusLatch) {
    p.bonusLatch = true;
    p.selected = p.selected > 1 || inv[p.selected + 1] === 0 ? 0 : p.selected + 1;
  }
  if (!p.selectKey && !p.useKey) p.bonusLatch = false;
  for (let i = 0; i < 2; i++) {
    // one pass per tick: [0, 0, X] needs two ticks to become [X, 0, 0]
    if (inv[i] !== 0 || inv[i + 1] === 0) continue;
    w.spr.n[p.slots.inv + i + 1] = 0;
    inv[i] = inv[i + 1];
    inv[i + 1] = 0;
  }
  placeInventory(w, p);
  const f = p.slots.selFrame;
  w.spr.n[f] = inv[0] === 0 ? 0 : SELECTION_FRAME;
  w.spr.x[f] = 30 * p.selected + HUD_X[p.index];
}

/**
 * PickupBonuses @0x1330C: only while flying high. Immediate kinds take effect at once (money leaves a
 * label); inventory kinds go to the first free slot, or are used at once when all three are full.
 */
export function pickupBonuses(w: World, p: Player): void {
  if (!p.high) return;
  const boni = w.data.tables.boni;
  for (let i = 1; i <= 10; i++) {
    const b = w.bonuses[i];
    if (!b.active || !hitDetect(w, p.slots.jet, SLOT + i)) continue;
    const info = boni[b.kind - 1];
    playSound(w, info.pickup_sound);
    if (info.pickup_sound !== 4) playSound(w, info.pickup_sound);
    if (!info.inventory) {
      useBonus(w, p, b.kind);
      if (b.kind === 1) {
        Object.assign(b, { timer: 100, active: false, kind: LABEL });
        w.spr.n[SLOT + i] = LABEL_SPRITE[w.twoPlayer ? 1 : 0];
      } else remove(w, i);
      continue;
    }
    const free = p.bonus.indexOf(0);
    if (free >= 0) {
      // Original bug (spec §12 #13): the item waited one tick in a single "pending" variable, so a second
      // pickup in the same tick overwrote it. The remake puts it into the slot at once.
      p.bonus[free] = b.kind;
      placeInventory(w, p);
    } else useBonus(w, p, b.kind);
    remove(w, i);
  }
}

/** BombTimer @0x12C03: grey flash for 4 frames, then every active enemy loses 100 (no money, drops allowed). */
export function bombTimer(w: World, p: Player): void {
  if (p.bombTimer === 0) return;
  if (p.bombTimer === 5) w.flash = true;
  p.bombTimer -= 1;
  if (p.bombTimer !== 0) return;
  w.flash = false;
  for (let i = 1; i <= 29; i++) {
    const e = w.enemies[i];
    if (!e.active) continue;
    e.energy -= 100;
    if (e.energy < 1) enemyDestroyed(w, null, i, true, true);
  }
}
