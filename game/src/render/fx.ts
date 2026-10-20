// Remastered effects, drawn on top of HiResView's level (render only: the simulation, and so the gameplay, stays
// the same). Shots and explosions glow (a blurred, additive copy tinted with the sprite's bright colour, and a soft
// halo); explosions light the ground around them; particles add sparks and a flash when an explosion starts, a
// muzzle flash when a shot appears, sparks where a shot ends inside the playfield (a hit), and smoke on the ground
// under ground explosions. What glows is decided by sprite number: the shot sprites of players and enemies (with
// the sprite cycles that animate them) and the explosion animations. Events come from comparing the drawn sprite
// tables of two ticks (afterTick), so a paused or frozen game spawns nothing and its particles stand still.

import { BlurFilter, Container, Sprite, Texture } from 'pixi.js';
import type { GameData } from '../data';
import { SLOTS, type SpriteTable } from '../sim/state';

const S = 4; // texture px per source px (HiResView)
const SHOT = 1;
const EXPLOSION = 2;
const FIRST_SLOT = 9; // 0..8 are the HUD
const LOW_EXPLOSIONS: [number, number] = [452, 491]; // AddExplosion: ground (low) explosions
const SNAP = 32; // as HiResView: a slot moving further per tick is a new object
const MAX_PARTICLES = 700;
const PLAYFIELD = { x0: 10, x1: 309, y0: 6, y1: 194 }; // a shot ending inside this was a hit, not leaving the screen
// Beams (Duallaser 8 x 200, the enemy lasers) are fired again every few ticks: sized by their length, their halo and
// muzzle flash flickered over half the screen (user, session 18: "a bit epileptic"). They only get a dimmer bloom.
const BEAM_ASPECT = 3;
const BEAM_BLOOM = 0.35;
const SHOT_RADIUS = 8; // cap for the halo and muzzle flash of large shots (Flamer, Golem fire)

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
  layer: 'spark' | 'smoke';
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
  private readonly bloomBlur = new BlurFilter({ strength: 8, quality: 3, resolution: 0.5 });
  private readonly used = new Map<Container, number>();
  private readonly dot: Texture;
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
    for (const n of shots) {
      this.kind[n] = SHOT;
      for (const c of cycles) if (n >= c.first && n <= c.last) for (let m = c.first; m <= c.last; m++) this.kind[m] = SHOT;
    }
    for (const a of t.explosion_anims) {
      for (let n = a.first; n <= a.last; n++) {
        this.kind[n] = EXPLOSION;
        this.progress[n] = (n - a.first) / Math.max(1, a.last - a.first);
      }
    }
    this.dot = softDot();
    this.ground.addChild(this.smoke, this.lights, this.explosionLights);
    for (const c of [this.lights, this.explosionLights, this.halos, this.explosionHalos]) c.blendMode = 'add';
    this.sparks.blendMode = 'add';
    this.bloomBlur.blendMode = 'add';
    this.bloom.filters = [this.bloomBlur];
    this.top.addChild(this.halos, this.explosionHalos, this.bloom, this.sparks);
  }

  /** After each simulation tick: spawn particles for what changed between the last two drawn tables. */
  afterTick(cur: SpriteTable, prev: SpriteTable | null, frame: number, scrollX: number, scrollY: number): void {
    this.frozen = frame === this.lastFrame;
    if (this.frozen) return;
    this.lastFrame = frame;
    this.ticks++;
    this.scrollX = scrollX;
    this.scrollY = scrollY;
    if (!prev) {
      this.particles = []; // a new level
      return;
    }
    const born = this.ticks - 1; // HiResView shows tick t from alpha 0 of the frame after it (now = ticks - 1 + alpha)
    const starts: number[] = [];
    for (let slot = FIRST_SLOT; slot < SLOTS; slot++) {
      const n = cur.n[slot], p = prev.n[slot];
      const moved = Math.abs(cur.x[slot] - prev.x[slot]) > SNAP || Math.abs(cur.y[slot] - prev.y[slot]) > SNAP;
      const kn = n < this.kind.length ? this.kind[n] : 0;
      const kp = p < this.kind.length ? this.kind[p] : 0;
      if (kn === EXPLOSION && this.progress[n] === 0 && (p !== n || moved)) {
        starts.push(slot);
      }
      const shotEnded = kp === SHOT && (kn !== SHOT || moved);
      const shotStarted = kn === SHOT && (kp !== SHOT || moved);
      if (shotEnded && !this.beam(p)) this.hit(p, prev.x[slot], prev.y[slot], born);
      if (shotStarted && !this.beam(n)) this.muzzle(n, cur.x[slot], cur.y[slot], born);
    }
    // the big kinds start up to 30 parts at once: share one budget of sparks and flashes
    const share = 1 / Math.sqrt(Math.max(1, starts.length));
    for (const slot of starts) this.explosion(slot, cur.n[slot], cur.x[slot], cur.y[slot], born, share);
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
  sprite(n: number, f: FxFrame, x: number, y: number): void {
    const k = n < this.kind.length ? this.kind[n] : 0;
    if (k === 0) return;
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
      const alpha = p.layer === 'smoke' ? p.alpha * Math.min(1, age / 4) * (1 - u) : p.alpha * (1 - u) ** 1.5;
      this.soft(p.layer === 'smoke' ? this.smoke : this.sparks, x, y, size, p.color, alpha);
    }
    for (const layer of [this.smoke, this.lights, this.explosionLights, this.halos, this.explosionHalos, this.bloom, this.sparks]) {
      const i = this.used.get(layer) ?? 0;
      for (let j = i; j < layer.children.length; j++) layer.children[j].visible = false;
    }
  }

  /** Hide everything (effects off, or not a level). */
  clear(): void {
    for (const layer of [this.smoke, this.lights, this.explosionLights, this.halos, this.explosionHalos, this.bloom, this.sparks]) {
      for (const c of layer.children) c.visible = false;
    }
  }

  /** A soft dot of diameter `size` source px centred on (x, y). */
  private soft(layer: Container, x: number, y: number, size: number, color: number, alpha: number): void {
    if (alpha <= 0.005 || size <= 0) return;
    const s = this.next(layer);
    s.texture = this.dot;
    s.anchor.set(0.5);
    s.x = x * S;
    s.y = y * S;
    s.width = s.height = size * S;
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
