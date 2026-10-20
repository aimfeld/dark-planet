// Explosions, sprite animations, sprite cycles and shadows.

import { MODE_SHADOW, playSound, type World } from './state';
import { mod } from './tp';

/**
 * AddExplosion @1d9e:1483: first free of 40 records. `high` is the altitude of the thing that exploded:
 * high explosions use slots 32..71 (in front of everything but the HUD), low ones 452..491.
 */
function addExplosion(w: World, anim: number, delay: number, x: number, y: number, high: boolean): void {
  for (let i = 1; i <= 40; i++) {
    const e = w.explosions[i];
    if (e.active) continue;
    e.slot = high ? i + 31 : i + 451;
    e.x = x;
    e.y = y;
    e.frame = w.data.tables.explosion_anims[anim - 1].first;
    e.delay = delay;
    e.active = true;
    e.anim = anim;
    return;
  }
}

/** Quake(ticks) @1d9e:1447: shake the screen for that many ticks, with sound 14. */
export function quake(w: World, ticks: number): void {
  w.quake = ticks;
  playSound(w, 14);
}

/** Explode(x, y, kind, altitude) @1d9e:157A: kinds 1-25 from tables.json `explosion_kinds`. */
export function explode(w: World, x: number, y: number, kind: number, high: boolean): void {
  const parts = w.data.tables.explosion_kinds[String(kind)];
  if (!parts) return;
  const ticks = w.data.tables.quake_ticks[String(kind)];
  if (ticks) quake(w, ticks);
  for (const p of parts) {
    let delay = p.delay;
    if (p.delay_rand) delay += w.rng.next(p.delay_rand) * (p.delay_step ?? 1);
    const rx = p.rx ? w.rng.next(p.rx) : 0;
    const ry = p.ry ? w.rng.next(p.ry) : 0;
    if (p.screen) addExplosion(w, p.anim, delay, rx + p.dx, w.scrollY + ry + p.dy, high);
    else addExplosion(w, p.anim, delay, x + p.dx + rx, y + p.dy + ry, high);
  }
}

/** ExplosionTick @1d9e:1004. */
export function explosionTick(w: World): void {
  const anims = w.data.tables.explosion_anims;
  for (let i = 1; i <= 40; i++) {
    const e = w.explosions[i];
    if (!e.active) continue;
    e.delay -= 1;
    const a = anims[e.anim - 1];
    if (mod(w.frame, a.rate) !== 0 || e.delay >= 1) continue;
    w.spr.n[e.slot] = e.frame;
    w.spr.x[e.slot] = e.x;
    w.spr.y[e.slot] = e.y;
    if (e.frame === a.first) playSound(w, a.sound, { belowVoices: 7 });
    if (e.frame > a.last) {
      e.active = false;
      w.spr.n[e.slot] = 0;
    }
    e.frame += 1;
  }
}

/** RemoveExplosion 1d9e:0FA4 for all 40 (StartBossFight). */
export function clearExplosions(w: World): void {
  for (let i = 1; i <= 40; i++) {
    const e = w.explosions[i];
    if (e.active) w.spr.n[e.slot] = 0;
    e.active = false;
  }
}

/** StartAnim(anim, slot) @1d9e:4071: a new anim on a slot replaces the old one. */
export function startAnim(w: World, anim: number, slot: number): void {
  for (let i = 1; i <= 40; i++) if (w.anims[i].state !== 0 && w.anims[i].slot === slot) w.anims[i].state = 0;
  const def = w.data.tables.sprite_anims[anim - 1];
  for (let i = 1; i <= 40; i++) {
    const a = w.anims[i];
    if (a.state !== 0) continue;
    a.slot = slot;
    a.anim = anim;
    a.state = def.reverse ? 2 : 1;
    w.spr.n[slot] = def.reverse ? def.last : def.first;
    return;
  }
}

function animEnd(w: World, i: number): void {
  const a = w.anims[i];
  a.state = 0;
  w.spr.n[a.slot] = w.data.tables.sprite_anims[a.anim - 1].rest;
  a.slot = 0;
}

/** AnimTick @1d9e:33FA. */
export function animTick(w: World): void {
  for (let i = 1; i <= 40; i++) {
    const a = w.anims[i];
    if (a.state === 0) continue;
    const def = w.data.tables.sprite_anims[a.anim - 1];
    const n = w.spr.n[a.slot];
    if (n === 0 || n < def.first || n > def.last) {
      a.state = 0; // the sprite was cleared or changed by someone else
      continue;
    }
    if (mod(w.frame, def.rate) !== 0) continue;
    if (a.state === 1) {
      if (n < def.last) w.spr.n[a.slot] = n + 1;
      else if (!def.ping_pong) animEnd(w, i);
      else a.state = 2;
    }
    if (a.state === 2) {
      const m = w.spr.n[a.slot];
      if (m > def.first) w.spr.n[a.slot] = m - 1;
      else animEnd(w, i);
    }
  }
}

/** SpriteCycles(episode) @1d9e:3105: sprites that animate by themselves. */
export function spriteCycles(w: World): void {
  w.cycleCounter += 1;
  const c = w.data.tables.sprite_cycles;
  const lists = [c.global, w.episode === 1 ? c.episode1 : c.episode2];
  const n = w.spr.n;
  for (let s = 1; s < n.length; s++) {
    if (n[s] === 0) continue;
    for (const list of lists) {
      for (const cy of list) {
        if (mod(w.cycleCounter, cy.rate) !== 0) continue;
        if (n[s] >= cy.first && n[s] < cy.last) n[s] += 1;
        else if (n[s] === cy.last) n[s] = cy.first;
      }
    }
  }
}

/** Shadows @1d9e:1C8A: enemy shadows, pod and jet shadows (same sprite in shadow mode). */
export function shadows(w: World): void {
  const types = w.data.tables.enemy_types;
  for (let i = 1; i <= 29; i++) {
    const e = w.enemies[i];
    const t = types[e.type - 1];
    if (e.active && t && t.shadow[0] !== 0) {
      setShadow(w, e.shadowSlot, w.spr.n[e.slot]);
      const d = e.layer === 1 ? [12, 12] : t.shadow;
      w.spr.x[e.shadowSlot] = w.spr.x[e.slot] + d[0];
      w.spr.y[e.shadowSlot] = w.spr.y[e.slot] + d[1];
    }
    if (!e.active && !e.dying) w.spr.n[e.shadowSlot] = 0;
  }
  for (const p of w.players) {
    if (!p.active) continue;
    for (let m = 0; m < 8; m++) {
      const mt = p.mounts[m];
      const s = p.slots.podShadows + m;
      if (mt.occupied && (mt.cat === 2 || mt.cat === 6)) {
        setShadow(w, s, w.spr.n[p.slots.pods + m]);
        w.spr.x[s] = w.spr.x[p.slots.pods + m] + p.shadowD;
        w.spr.y[s] = w.spr.y[p.slots.pods + m] + p.shadowD;
      } else w.spr.n[s] = 0;
    }
    setShadow(w, p.slots.shadow, w.spr.n[p.slots.jet]);
    w.spr.x[p.slots.shadow] = w.spr.x[p.slots.jet] + p.shadowD;
    w.spr.y[p.slots.shadow] = w.spr.y[p.slots.jet] + p.shadowD;
  }
  if (mod(w.frame, 2) === 0) {
    for (const p of w.players) {
      if (!p.active) continue;
      if (!p.high && p.shadowD > 2) p.shadowD -= 1;
      if (p.high && p.shadowD < 12) p.shadowD += 1;
    }
  }
}

function setShadow(w: World, slot: number, n: number): void {
  w.spr.n[slot] = n;
  w.spr.mode[slot] = MODE_SHADOW;
}
