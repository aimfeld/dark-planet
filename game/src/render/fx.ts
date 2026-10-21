// Remastered effects, drawn on top of HiResView's level (render only: the simulation, and so the gameplay, stays
// the same). Shots and explosions glow (a blurred, additive copy tinted with the sprite's bright colour, and a soft
// halo); explosions light the ground around them; particles add sparks and a flash when an explosion starts, a
// muzzle flash when a shot appears, sparks where a shot ends inside the playfield (a hit), and smoke on the ground
// under ground explosions. What glows is decided by sprite number: the shot sprites of players and enemies (with
// the sprite cycles that animate them) and the explosion animations. Events come from comparing the drawn sprite
// tables of two ticks (afterTick), so a paused or frozen game spawns nothing and its particles stand still.
// The jets have engine flames and a trail (longer when flying forward); hits flash (HiResView draws an additive
// copy of the sprite: enemies whose energy dropped, the player's jet in red with a red screen edge, a blue ring when
// the shield takes it); a badly damaged jet smokes.

import { BlurFilter, Container, Sprite, Texture } from 'pixi.js';
import type { GameData, Sprite as IndexedSprite } from '../data';
import { LOW_SLOT_SHIFT, P1_SLOTS, P2_SLOT_SHIFT, SLOTS, type SpriteTable, type World } from '../sim/state';

const S = 4; // texture px per source px (HiResView)
const SHOT = 1;
const EXPLOSION = 2;
const PLAIN_SHOT = 3; // a shot without glow and light (still a muzzle flash and hit sparks)
// Rockets and bullets don't glow (user, session 19); by sprite, with the sprite cycles that animate them
const NO_GLOW = [
  146, 168, 184, 240, 246, 247, 262, // missiles, the atom bomb, rockets, the enemies' darts and missiles
  150, 156, 232, 244, // MG/Autogun and MK Pod rounds, the enemies' pellet and bullet
];
const FIRST_SLOT = 9; // 0..8 are the HUD
const LOW_EXPLOSIONS: [number, number] = [452, 491]; // AddExplosion: ground (low) explosions
const SNAP = 32; // as HiResView: a slot moving further per tick is a new object
const MAX_PARTICLES = 900;
const PLAYFIELD = { x0: 10, x1: 309, y0: 6, y1: 194 }; // a shot ending inside this was a hit, not leaving the screen
// Beams (Duallaser 8 x 200, the enemy lasers) are fired again every few ticks: sized by their length, their halo and
// muzzle flash flickered over half the screen (user, session 18: "a bit epileptic"). They only get a dimmer bloom.
const BEAM_ASPECT = 3;
const BEAM_BLOOM = 0.35;
const SHOT_RADIUS = 8; // cap for the halo and muzzle flash of large shots (Flamer, Golem fire)
// Engine flames by jet (outer, core); the Steptokopter (4) has rotors. The Alien-Pros burn blue.
const FLAMES: Record<number, [number, number]> = { 1: [0xff7a28, 0xfff0c0], 2: [0xff7a28, 0xfff0c0], 3: [0x3a8cff, 0xd8f0ff], 5: [0x3a8cff, 0xd8f0ff] };
const FLASH_TICKS = 5;
const HURT_TICKS = 14; // the red screen edge
const SHIELD_TICKS = 10;
const SHIELD_COLOR = 0x5cc8ff;
const SMOKE_BELOW = 0.35; // a jet below this share of its life smokes, below half of it also sparks

export interface FxFrame {
  texture: Texture;
  ox: number;
  oy: number;
  scale: number;
}

interface Particle {
  x: number; // level coordinates (source px) at birth
  y: number;
  vx: number; // source px per tick at birth, slowed by `drag` every tick
  vy: number;
  drag: number;
  rise: number; // px per tick upwards, constant (smoke)
  t0: number; // birth (ticks)
  life: number; // ticks
  size0: number; // diameter in source px
  size1: number;
  alpha: number;
  color: number;
  layer: 'spark' | 'smoke' | 'jetSmoke';
}

interface Nozzle {
  x: number; // centre, in the sprite (source px)
  y: number; // bottom edge
  w: number;
}

/** A player as the last tick left it, for damage events and the jet's effects. */
interface Pilot {
  active: boolean;
  life: number;
  shield: number;
  maxLife: number;
  thrust: number; // 0.4 (backwards) .. 1 .. 1.6 (full speed forwards)
  damage: number; // 0, or 0..1 below SMOKE_BELOW of the life: smoke and a fire on the jet
  hurt: number; // red edge strength at hurtT
  hurtT: number;
  shieldT: number;
}

export class Fx {
  /** Under the sprites, over the background: smoke, then the explosion light. */
  readonly ground = new Container();
  /** Over the sprites: halos, the bloom layer and the sparks. */
  readonly top = new Container();
  private readonly smoke = new Container();
  private readonly lights = new Container();
  private readonly halos = new Container();
  private readonly explosionLights = new Container();
  private readonly explosionHalos = new Container();
  private readonly bloom = new Container();
  private readonly sparks = new Container();
  private readonly flames = new Container();
  private readonly jetSmoke = new Container();
  private readonly vignette: Sprite;
  private readonly bloomBlur = new BlurFilter({ strength: 8, quality: 3, resolution: 0.5 });
  private readonly used = new Map<Container, number>();
  private readonly dot: Texture;
  private readonly ring: Texture;
  private readonly nozzles = new Map<number, { jet: number; list: Nozzle[] }>(); // by jet frame
  private readonly pilots: Pilot[] = [0, 1].map(() => ({
    active: false, life: 0, shield: 0, maxLife: 1, thrust: 1, damage: 0, hurt: 0, hurtT: -1e9, shieldT: -1e9,
  }));
  private readonly enemyEnergy = new Int32Array(30).fill(-1); // by enemy index, -1 = not active last tick
  private readonly enemySlot = new Int32Array(30);
  private readonly flashes = new Map<number, { t0: number; tint: number; alpha: number }>(); // by slot
  private readonly kind: Uint8Array; // by sprite number: 0, SHOT or EXPLOSION
  private readonly progress: Float32Array; // explosions: 0 at the first frame .. 1 at the last
  private readonly colors = new Map<number, number>();
  private particles: Particle[] = [];
  private ticks = 0;
  private lastFrame = -1;
  private frozen = false;
  private scrollX = 0; // the scroll position of the tick (afterTick) or the frame (begin..end)
  private scrollY = 0;
  private alpha = 0;
  private explosions = 0; // explosion sprites this frame

  constructor(private readonly data: GameData) {
    const t = data.tables;
    const max = Math.max(...data.sprites.keys()) + 1;
    this.kind = new Uint8Array(max);
    this.progress = new Float32Array(max);
    const shots = [...t.shot_types.map((s) => s.sprite), ...t.enemy_shot_kinds.map((k) => k.sprite)];
    const cycles = [...t.sprite_cycles.global, ...t.sprite_cycles.episode1, ...t.sprite_cycles.episode2];
    const mark = (n: number, k: number) => {
      this.kind[n] = k;
      for (const c of cycles) if (n >= c.first && n <= c.last) for (let m = c.first; m <= c.last; m++) this.kind[m] = k;
    };
    for (const n of shots) mark(n, SHOT);
    for (const n of NO_GLOW) mark(n, PLAIN_SHOT);
    for (const a of t.explosion_anims) {
      for (let n = a.first; n <= a.last; n++) {
        this.kind[n] = EXPLOSION;
        this.progress[n] = (n - a.first) / Math.max(1, a.last - a.first);
      }
    }
    for (const jet of t.jets) {
      if (!FLAMES[jet.id]) continue;
      for (let n = jet.frame_base; n < jet.frame_base + 7; n++) {
        const s = data.sprites.get(n);
        if (s) this.nozzles.set(n, { jet: jet.id, list: nozzles(s) });
      }
    }
    this.dot = softDot();
    this.ring = softRing();
    this.vignette = new Sprite(vignette());
    this.ground.addChild(this.smoke, this.lights, this.explosionLights);
    for (const c of [this.lights, this.explosionLights, this.halos, this.explosionHalos, this.flames]) c.blendMode = 'add';
    this.sparks.blendMode = 'add';
    this.bloomBlur.blendMode = 'add';
    this.bloom.filters = [this.bloomBlur];
    this.top.addChild(this.jetSmoke, this.halos, this.explosionHalos, this.flames, this.bloom, this.sparks, this.vignette);
  }

  /** After each simulation tick: spawn particles for what changed between the last two drawn tables. */
  afterTick(w: World, prev: SpriteTable | null): void {
    const cur = w.drawn;
    this.frozen = w.frame === this.lastFrame;
    if (this.frozen) return;
    this.lastFrame = w.frame;
    this.ticks++;
    this.scrollX = w.drawnScrollX;
    this.scrollY = w.drawnScrollY;
    const born = this.ticks - 1; // HiResView shows tick t from alpha 0 of the frame after it (now = ticks - 1 + alpha)
    if (!prev) {
      this.particles = []; // a new level
      this.flashes.clear();
      this.enemyEnergy.fill(-1);
      for (const p of this.pilots) p.active = false;
    }
    this.players(w, born);
    this.enemies(w, born);
    if (!prev) return;
    const starts: number[] = [];
    for (let slot = FIRST_SLOT; slot < SLOTS; slot++) {
      const n = cur.n[slot], p = prev.n[slot];
      const moved = Math.abs(cur.x[slot] - prev.x[slot]) > SNAP || Math.abs(cur.y[slot] - prev.y[slot]) > SNAP;
      const kn = n < this.kind.length ? this.kind[n] : 0;
      const kp = p < this.kind.length ? this.kind[p] : 0;
      if (kn === EXPLOSION && this.progress[n] === 0 && (p !== n || moved)) {
        starts.push(slot);
      }
      const shotEnded = shot(kp) && (!shot(kn) || moved);
      const shotStarted = shot(kn) && (!shot(kp) || moved);
      if (shotEnded && !this.beam(p)) this.hit(p, prev.x[slot], prev.y[slot], born);
      if (shotStarted && !this.beam(n)) this.muzzle(n, cur.x[slot], cur.y[slot], born);
    }
    // the big kinds start up to 30 parts at once: share one budget of sparks and flashes
    const share = 1 / Math.sqrt(Math.max(1, starts.length));
    for (const slot of starts) this.explosion(slot, cur.n[slot], cur.x[slot], cur.y[slot], born, share);
  }

  /** Damage to the players (life and shield drops), the flame's thrust, smoke from a badly damaged jet. */
  private players(w: World, born: number): void {
    const t = w.data.tables;
    for (const p of w.players) {
      const q = this.pilots[p.index];
      if (!p.active) {
        q.active = false;
        continue;
      }
      const slot = p.slots.jet;
      const maxLife = t.jets[p.jet - 1].max_life;
      const max = p.engine === 0 ? t.no_engine_max_speed : t.engines[p.engine - 1].max_speed;
      q.thrust = 1 - (0.6 * p.vy) / Math.max(1, max);
      q.maxLife = maxLife;
      if (q.active) {
        const now = this.ticks - 1;
        const dl = q.life - p.life, ds = q.shield - p.shield;
        if (dl > 0) {
          q.hurt = Math.max(this.hurt(q, now), Math.min(0.45, 0.12 + (3 * dl) / maxLife));
          q.hurtT = born;
          this.flashes.set(slot, { t0: born, tint: 0xff5a4a, alpha: 1.6 });
        }
        if (ds > 0) q.shieldT = born;
        if (ds > 0 && p.shield <= 0) this.burst(slot, w.drawn, born, SHIELD_COLOR, 14); // the shield is gone
      }
      q.active = true;
      q.life = p.life;
      q.shield = p.shield;
      const jet = this.nozzles.get(w.drawn.n[slot]);
      if (jet) {
        const [outer] = FLAMES[jet.jet];
        for (const z of jet.list) {
          this.add({ x: w.drawn.x[slot] + z.x + (Math.random() - 0.5) * z.w * 0.5, y: w.drawn.y[slot] + z.y + 1,
            vx: (Math.random() - 0.5) * 0.25, vy: 1 + 1.2 * q.thrust, drag: 0.92, rise: 0, t0: born, life: 7 + Math.random() * 5,
            size0: Math.min(7, 3 + z.w * 0.4), size1: 1, alpha: 0.7, color: outer, layer: 'spark' });
        }
      }
      const share = p.life / maxLife;
      q.damage = share < SMOKE_BELOW && p.life >= 0 ? 1 - share / SMOKE_BELOW : 0;
      if (w.drawn.n[slot] === 0 || q.damage === 0) continue;
      const [sw, sh] = this.size(w.drawn.n[slot]);
      const cx = w.drawn.x[slot] + sw / 2, cy = w.drawn.y[slot] + sh * 0.8; // the tail: the smoke trails behind
      const hurt = q.damage;
      if (Math.random() < 0.25 + 0.6 * hurt) {
        this.add({ x: cx + (Math.random() - 0.5) * sw * 0.4, y: cy + (Math.random() - 0.5) * sh * 0.3,
          vx: (Math.random() - 0.5) * 0.4, vy: 0.5, drag: 0.97, rise: 0, t0: born, life: 24 + Math.random() * 16,
          size0: 6, size1: 18 + 8 * hurt, alpha: 0.8 + 0.2 * hurt, color: 0x2e2b28, layer: 'jetSmoke' });
      }
      if (hurt > 0.5 && Math.random() < 0.12) this.burst(slot, w.drawn, born, 0xffb050, 3);
    }
  }

  /** Red screen edge of player q at time `now` (ticks). */
  private hurt(q: Pilot, now: number): number {
    const u = (now - q.hurtT) / HURT_TICKS;
    return u < 0 || u >= 1 ? 0 : q.hurt * (1 - u) ** 1.2;
  }

  /** A few sparks flying out of the sprite in `slot`. */
  private burst(slot: number, cur: SpriteTable, born: number, color: number, count: number): void {
    const [w, h] = this.size(cur.n[slot]);
    const cx = cur.x[slot] + w / 2, cy = cur.y[slot] + h / 2, r = Math.max(w, h) * 0.45;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, v = 1 + Math.random() * 1.6;
      this.add({ x: cx + Math.cos(a) * r * 0.6, y: cy + Math.sin(a) * r * 0.6, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        drag: 0.85, rise: 0, t0: born, life: 8 + Math.random() * 8, size0: 1.5, size1: 0.5, alpha: 1,
        color: mix(color, 0xffffff, 0.3), layer: 'spark' });
    }
  }

  /** Enemies whose energy dropped flash. */
  private enemies(w: World, born: number): void {
    for (let i = 1; i < w.enemies.length; i++) {
      const e = w.enemies[i];
      if (e.active && !e.dying) {
        if (this.enemySlot[i] === e.slot && this.enemyEnergy[i] > e.energy) {
          this.flashes.set(e.slot, { t0: born, tint: 0xffffff, alpha: 1.6 });
        }
        this.enemyEnergy[i] = e.energy;
        this.enemySlot[i] = e.slot;
      } else {
        this.enemyEnergy[i] = -1;
      }
    }
    for (const [slot, f] of this.flashes) if (born - f.t0 >= FLASH_TICKS) this.flashes.delete(slot);
  }

  /** An enemy hit or the hurt jet: HiResView draws additive copies of the sprite in `slot` (alpha above 1: two). */
  flash(slot: number): { tint: number; alpha: number } | null {
    const f = this.flashes.get(slot);
    if (!f) return null;
    const u = (this.ticks - 1 + this.alpha - f.t0) / FLASH_TICKS;
    return u < 0 || u >= 1 ? null : { tint: f.tint, alpha: f.alpha * (1 - u) ** 1.5 };
  }

  private size(n: number): [number, number] {
    const s = this.data.sprites.get(n);
    return s ? [s.w, s.h] : [8, 8];
  }

  private beam(n: number): boolean {
    const [w, h] = this.size(n);
    return Math.max(w, h) >= BEAM_ASPECT * Math.max(1, Math.min(w, h));
  }

  private explosion(slot: number, n: number, x: number, y: number, born: number, share: number): void {
    const [w, h] = this.size(n);
    const cx = x + w / 2, cy = y + h / 2, r = Math.max(w, h) / 2;
    const color = this.color(n);
    this.add({ x: cx, y: cy, vx: 0, vy: 0, drag: 1, rise: 0, t0: born, life: 5, size0: r * 3, size1: r * 4,
      alpha: 0.5 * share, color: mix(color, 0xffffff, 0.5), layer: 'spark' });
    const count = Math.round(Math.min(24, 6 + r * 0.8) * share);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, v = 1.2 + Math.random() * (1.5 + r / 8);
      this.add({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 0.86, rise: 0, t0: born,
        life: 10 + Math.random() * 14, size0: 1.6 + Math.random() * 1.6, size1: 0.6, alpha: 1,
        color: mix(color, 0xffe080, Math.random() * 0.7), layer: 'spark' });
    }
    if (slot >= LOW_EXPLOSIONS[0] && slot <= LOW_EXPLOSIONS[1]) {
      for (let i = 0; i < Math.max(1, Math.round(4 * share)); i++) {
        const a = Math.random() * Math.PI * 2, d = Math.random() * r * 0.6;
        this.add({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3, drag: 0.98, rise: 0.12, t0: born + 3 + i * 2, life: 45 + Math.random() * 30,
          size0: r * 0.9, size1: r * 2.2, alpha: 0.45, color: 0x2a2724, layer: 'smoke' });
      }
    }
  }

  private hit(n: number, x: number, y: number, born: number): void {
    const [w, h] = this.size(n);
    const cx = x + w / 2, cy = y + h / 2;
    const sx = cx - this.scrollX, sy = cy - this.scrollY;
    if (sx < PLAYFIELD.x0 || sx > PLAYFIELD.x1 || sy < PLAYFIELD.y0 || sy > PLAYFIELD.y1) return;
    const color = this.color(n);
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2, v = 0.8 + Math.random() * 1.8;
      this.add({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 0.84, rise: 0, t0: born,
        life: 6 + Math.random() * 6, size0: 1.4, size1: 0.5, alpha: 1, color: mix(color, 0xffffff, 0.4), layer: 'spark' });
    }
  }

  private muzzle(n: number, x: number, y: number, born: number): void {
    const [w, h] = this.size(n);
    const r = Math.min(SHOT_RADIUS, Math.max(4, Math.max(w, h) / 2));
    this.add({ x: x + w / 2, y: y + h / 2, vx: 0, vy: 0, drag: 1, rise: 0, t0: born, life: 3, size0: r * 3, size1: r * 2,
      alpha: 0.55, color: mix(this.color(n), 0xffffff, 0.3), layer: 'spark' });
  }

  private add(p: Particle): void {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push(p);
  }

  /** Start a frame: the scroll position the sprites are drawn at (source px, scroll y interpolated). */
  begin(scrollX: number, scrollY: number, alpha: number, pxPerSource: number): void {
    this.scrollX = scrollX;
    this.scrollY = scrollY;
    this.alpha = this.frozen ? 1 : alpha;
    this.used.clear();
    this.explosions = 0;
    this.bloomBlur.strength = 2.5 * pxPerSource;
  }


  /** A sprite drawn at (x, y) on the screen (source px): glow and light if it is a shot or an explosion. */
  sprite(n: number, f: FxFrame, x: number, y: number, slot: number): void {
    const jet = this.nozzles.get(n);
    if (jet) this.jet(n, jet.jet, jet.list, x, y, slot);
    const k = n < this.kind.length ? this.kind[n] : 0;
    if (k === 0 || k === PLAIN_SHOT) return;
    const color = this.color(n);
    const b = this.next(this.bloom);
    b.texture = f.texture;
    b.x = (x + f.ox) * S;
    b.y = (y + f.oy) * S;
    b.scale.set(S / f.scale);
    b.tint = color;
    const beam = k === SHOT && this.beam(n);
    b.alpha = k === SHOT ? (beam ? BEAM_BLOOM : 1) : 0.6;
    const [w, h] = this.size(n);
    const cx = x + w / 2, cy = y + h / 2;
    if (beam) return;
    if (k === SHOT) {
      const r = Math.min(SHOT_RADIUS, Math.max(w, h) / 2);
      this.soft(this.halos, cx, cy, Math.max(10, r * 4), color, 0.3);
      this.soft(this.lights, cx, cy, Math.max(14, r * 5), color, 0.1);
    } else {
      const r = Math.max(w, h) / 2;
      this.explosions++;
      const fade = 1 - this.progress[n];
      this.soft(this.explosionHalos, cx, cy, r * 2.6, mix(color, 0xffd080, 0.4), 0.25 * fade);
      this.soft(this.explosionLights, cx, cy, r * 4.5, mix(color, 0xff9a40, 0.5), 0.3 * fade);
    }
  }

  /** Engine flames and the shield ring (the exhaust trail is particles, from players()). */
  private jet(n: number, id: number, list: Nozzle[], x: number, y: number, slot: number): void {
    const q = this.pilots[pilotOf(slot)];
    if (!q?.active) return;
    const now = this.ticks - 1 + this.alpha;
    const [outer, core] = FLAMES[id];
    list.forEach((z, i) => {
      const flicker = 0.85 + 0.09 * Math.sin(now * 1.7 + i * 2) + 0.06 * Math.sin(now * 4.3 + i);
      const fw = Math.max(3.5, Math.min(9, z.w * 0.9));
      const len = (7 + z.w * 0.6) * q.thrust * flicker;
      const cx = x + z.x, by = y + z.y - 1;
      this.soft(this.flames, cx, by + len * 0.4, fw * 2.6, outer, 0.45 * flicker, len * 1.8); // glow
      for (const u of [0.1, 0.35, 0.6, 0.85]) {
        const d = fw * (1.5 - 1.1 * u); // a cone of dots, hot at the nozzle
        this.soft(this.flames, cx, by + len * u, d, mix(core, outer, Math.min(1, u * 1.4)), 0.95 - 0.5 * u, d * 1.8);
      }
      this.soft(this.flames, cx, by + len * 0.12, fw * 0.8, 0xffffff, 0.8, len * 0.45);
    });
    const [w, h] = this.size(n);
    if (q.damage > 0) {
      // a small fire on the damaged jet, left of the middle
      const flicker = 0.7 + 0.2 * Math.sin(now * 2.1) + 0.1 * Math.sin(now * 5.3);
      const fx = x + w * 0.38, fy = y + h * 0.62, r = (3 + 2.5 * q.damage) * flicker;
      this.soft(this.flames, fx, fy, r * 5, 0xff6a20, 0.4 * flicker);
      this.soft(this.flames, fx, fy, r * 2.2, 0xff8a30, flicker);
      this.soft(this.flames, fx, fy - r * 0.3, r, 0xffe0a0, 0.9 * flicker);
    }
    const u = (now - q.shieldT) / SHIELD_TICKS;
    if (u >= 0 && u < 1) {
      const d = Math.max(w, h) * (1.15 + 0.12 * u);
      const s = this.next(this.halos);
      s.texture = this.ring;
      s.anchor.set(0.5);
      s.x = (x + w / 2) * S;
      s.y = (y + h / 2) * S;
      s.width = s.height = d * S;
      s.tint = SHIELD_COLOR;
      s.alpha = 0.8 * (1 - u) ** 1.3;
      this.soft(this.halos, x + w / 2, y + h / 2, d * 0.9, SHIELD_COLOR, 0.15 * (1 - u));
    }
  }

  /** Draw the particles and hide what this frame didn't use. */
  end(): void {
    // many overlapping explosions would add up to white: dim their light as 1 / sqrt(count)
    const dim = Math.min(1, 2 / Math.sqrt(Math.max(1, this.explosions)));
    this.explosionHalos.alpha = this.explosionLights.alpha = dim;
    const now = this.ticks - 1 + this.alpha;
    this.particles = this.particles.filter((p) => now - p.t0 < p.life);
    for (const p of this.particles) {
      const age = now - p.t0;
      if (age < 0) continue;
      const u = age / p.life;
      const travel = p.drag === 1 ? age : (1 - p.drag ** age) / (1 - p.drag);
      const x = p.x + p.vx * travel - this.scrollX;
      const y = p.y + p.vy * travel - p.rise * age - this.scrollY;
      const size = p.size0 + (p.size1 - p.size0) * u;
      const smoky = p.layer !== 'spark';
      const alpha = smoky ? p.alpha * Math.min(1, age / 4) * (1 - u) : p.alpha * (1 - u) ** 1.5;
      this.soft(this.layer(p.layer), x, y, size, p.color, alpha);
    }
    const hurt = Math.max(...this.pilots.map((q) => (q.active ? this.hurt(q, now) : 0)));
    this.vignette.visible = hurt > 0.005;
    this.vignette.alpha = hurt;
    this.vignette.x = PLAYFIELD.x0 * S - 2 * S;
    this.vignette.width = (PLAYFIELD.x1 - PLAYFIELD.x0 + 5) * S;
    this.vignette.height = 200 * S;
    for (const layer of [this.smoke, this.lights, this.explosionLights, this.halos, this.explosionHalos, this.bloom, this.sparks,
      this.flames, this.jetSmoke]) {
      const i = this.used.get(layer) ?? 0;
      for (let j = i; j < layer.children.length; j++) layer.children[j].visible = false;
    }
  }

  private layer(name: Particle['layer']): Container {
    switch (name) {
      case 'spark': return this.sparks;
      case 'smoke': return this.smoke;
      case 'jetSmoke': return this.jetSmoke;
    }
  }

  /** A soft dot of diameter `size` (or an ellipse `size` x `height`) source px centred on (x, y). */
  private soft(layer: Container, x: number, y: number, size: number, color: number, alpha: number, height = size): void {
    if (alpha <= 0.005 || size <= 0) return;
    const s = this.next(layer);
    s.texture = this.dot;
    s.anchor.set(0.5);
    s.x = x * S;
    s.y = y * S;
    s.width = size * S;
    s.height = height * S;
    s.tint = color;
    s.alpha = Math.min(1, alpha);
  }

  private next(layer: Container): Sprite {
    const i = this.used.get(layer) ?? 0;
    this.used.set(layer, i + 1);
    let s = layer.children[i] as Sprite | undefined;
    if (!s) {
      s = new Sprite();
      layer.addChild(s);
    }
    s.visible = true;
    return s;
  }

  /** The sprite's bright colour: its pixels averaged with weight luminance², brightened to full intensity. */
  private color(n: number): number {
    const known = this.colors.get(n);
    if (known !== undefined) return known;
    const s = this.data.sprites.get(n);
    const rgb = this.data.palette.rgb;
    let r = 0, g = 0, b = 0, sum = 0;
    if (s) {
      for (const c of s.px) {
        if (c === 0) continue;
        const [cr, cg, cb] = rgb[c];
        const l = (0.299 * cr + 0.587 * cg + 0.114 * cb) / 255;
        const wgt = l * l;
        r += cr * wgt;
        g += cg * wgt;
        b += cb * wgt;
        sum += wgt;
      }
    }
    let color = 0xffc070;
    if (sum > 0) {
      const m = Math.max(r, g, b) / sum || 1;
      const k = 255 / m;
      color = (Math.round((r / sum) * k) << 16) | (Math.round((g / sum) * k) << 8) | Math.round((b / sum) * k);
    }
    this.colors.set(n, color);
    return color;
  }
}

function shot(k: number): boolean {
  return k === SHOT || k === PLAIN_SHOT;
}

/** Mix two 0xRRGGBB colours, t = 0 → a, 1 → b. */
function mix(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** A white disc fading to transparent at the rim (smooth falloff), 64 x 64. */
function softDot(): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (let i = 0; i <= 8; i++) {
    const u = i / 8;
    g.addColorStop(u, `rgba(255,255,255,${(1 - u) ** 2})`);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return Texture.from(c);
}

/** The player whose jet is in `slot` (high or low slot range), or -1. */
function pilotOf(slot: number): number {
  for (const [i, base] of [P1_SLOTS.jet, P1_SLOTS.jet + P2_SLOT_SHIFT].entries()) {
    if (slot === base || slot === base + LOW_SLOT_SHIFT) return i;
  }
  return -1;
}

/** The jet's nozzles: runs of opaque columns in its two lowest rows (one run when banking hides the other). */
function nozzles(s: IndexedSprite): Nozzle[] {
  let bottom = -1;
  for (let x = 0; x < s.w; x++) bottom = Math.max(bottom, s.bottom[x]);
  const list: Nozzle[] = [];
  let start = -1;
  for (let x = 0; x <= s.w; x++) {
    const on = x < s.w && s.bottom[x] >= bottom - 1;
    if (on && start < 0) start = x;
    if (!on && start >= 0) {
      let b = 0;
      for (let i = start; i < x; i++) b = Math.max(b, s.bottom[i]);
      list.push({ x: (start + x) / 2, y: b + 1, w: x - start });
      start = -1;
    }
  }
  return list;
}

/** A soft ring (the shield), 128 x 128. */
function softRing(): Texture {
  return radial(128, [[0, 0], [0.55, 0], [0.8, 0.35], [0.9, 1], [1, 0]]);
}

/** Transparent in the middle, red at the edges (the hurt flash; stretched over the playfield). */
function vignette(): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 91);
  g.addColorStop(0, 'rgba(255,30,20,0)');
  g.addColorStop(0.5, 'rgba(255,30,20,0)');
  g.addColorStop(0.78, 'rgba(255,30,20,0.45)');
  g.addColorStop(1, 'rgba(255,30,20,1)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return Texture.from(c);
}

/** A white radial gradient through the stops [radius 0..1, alpha]. */
function radial(size: number, stops: [number, number][]): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [u, a] of stops) g.addColorStop(u, `rgba(255,255,255,${a})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return Texture.from(c);
}
