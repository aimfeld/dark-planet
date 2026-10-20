// Remastered renderer (experiment): draws a World with the 4x upscaled sprites and level backgrounds from
// tools/remaster_upscale.py (game/public/remaster/<method>/) instead of the 320 x 200 framebuffer. It mirrors
// Framebuffer.render: background, energy bars, then slots 920..0 (slots 0..8 = HUD over the full screen, the
// others clipped to the playfield x 8..311). Sprites without an upscaled version (and the text sprites) are
// drawn from the indexed data with nearest-neighbour scaling.

import { Assets, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import type { GameData } from '../data';
import { cp437 } from '../screens/screen';
import { FADE_STEPS, MODE_SHADOW, SLOTS, type World } from '../sim/state';
import { H, W } from './framebuffer';

export const REMASTER_METHODS = ['hq4x', 'xbr4', 'esrgan', 'esrgan-anime', 'animevideo'] as const;
export type RemasterMethod = (typeof REMASTER_METHODS)[number];

const S = 4; // upscale factor of the assets
const CLIP_X0 = 8;
const CLIP_X1 = 311;
const FULL_WINDOW_SLOTS = 8;
const LEVEL_TOP = -6200; // level y of the first background row
const CHUNKS = 25;

interface Index {
  scale: number;
  chunk: number;
  groups: Record<string, number>;
  sprites: Record<string, [string, number, number, number, number, number, number, number]>;
}

interface Frame {
  texture: Texture;
  ox: number; // where the trimmed picture starts in the sprite (source px)
  oy: number;
  scale: number; // texture px per source px
}

export class HiResView {
  readonly root = new Container();
  private readonly background = new Container();
  private readonly playfield = new Container();
  private readonly hud = new Container();
  private readonly bars = new Graphics();
  private readonly overlay = new Graphics();
  private readonly playPool: Sprite[] = [];
  private readonly hudPool: Sprite[] = [];
  private readonly chunkSprites: Sprite[] = [];
  private readonly shadowAlpha: number;
  private readonly fallback = new Map<string, Frame>(); // nearest-scaled indexed sprites and texts
  private index: Index | null = null;
  private pages = new Map<string, Promise<Texture>>();
  private loadedPages = new Map<string, Texture>();
  private chunks = new Map<string, Texture | 'loading'>();
  private method: RemasterMethod | null = null;

  constructor(private readonly data: GameData) {
    const clip = new Graphics().rect(CLIP_X0 * S, 0, (CLIP_X1 - CLIP_X0 + 1) * S, H * S).fill(0xffffff);
    const clipped = new Container();
    clipped.addChild(this.background, this.playfield);
    clipped.mask = clip;
    this.root.addChild(clip, this.bars, clipped, this.hud, this.overlay);
    for (let i = 0; i < 3; i++) {
      const s = new Sprite();
      this.chunkSprites.push(s);
      this.background.addChild(s);
    }
    this.shadowAlpha = 1 - shadowRatio(data);
  }

  get current(): RemasterMethod | null {
    return this.method;
  }

  /** Switch the asset set (null = off). Pages and chunks load on demand; until then draw() returns false. */
  async use(method: RemasterMethod | null): Promise<void> {
    this.method = method;
    this.index = null;
    for (const t of this.loadedPages.values()) t.destroy(true);
    for (const t of this.chunks.values()) if (t !== 'loading') t.destroy(true);
    this.pages.clear();
    this.loadedPages.clear();
    this.chunks.clear();
    for (const s of this.chunkSprites) s.visible = false;
    this.frames.clear();
    if (!method) return;
    const res = await fetch(`${this.base()}sprites.json`);
    if (this.method === method) this.index = (await res.json()) as Index;
  }

  private base(): string {
    return `${import.meta.env.BASE_URL}remaster/${this.method}/`;
  }

  private page(group: string, p: number): Texture | null {
    const key = `${group}_${p}`;
    const t = this.loadedPages.get(key);
    if (t) return t;
    if (!this.pages.has(key)) {
      const method = this.method;
      const promise = Assets.load<Texture>({ src: `${this.base()}${key}.webp`, data: { autoGenerateMipmaps: true } });
      this.pages.set(key, promise);
      promise.then((tex) => {
        if (this.method === method) this.loadedPages.set(key, tex);
      });
    }
    return null;
  }

  private readonly frames = new Map<number, Frame | null>();

  /** The upscaled frame of sprite n, or null while its page loads; the indexed fallback if it has none. */
  private frame(n: number): Frame | null {
    const known = this.frames.get(n);
    if (known) return known;
    const entry = this.index!.sprites[n];
    if (!entry) return this.indexed(`s${n}`, () => {
      const s = this.data.sprites.get(n);
      return s ? { w: s.w, h: s.h, px: s.px } : null;
    });
    const [group, p, x, y, w, h, ox, oy] = entry;
    const page = this.page(group, p);
    if (!page) return null;
    const f = { texture: new Texture({ source: page.source, frame: new Rectangle(x, y, w, h) }), ox, oy, scale: S };
    this.frames.set(n, f);
    return f;
  }

  /** A texture made from palette indices, drawn 4x with nearest-neighbour scaling. */
  private indexed(key: string, make: () => { w: number; h: number; px: Uint8Array } | null): Frame | null {
    const known = this.fallback.get(key);
    if (known) return known;
    const img = make();
    if (!img || img.w === 0 || img.h === 0) return null;
    const canvas = document.createElement('canvas');
    canvas.width = img.w;
    canvas.height = img.h;
    const ctx = canvas.getContext('2d')!;
    const out = ctx.createImageData(img.w, img.h);
    const rgb = this.data.palette.rgb;
    for (let i = 0; i < img.px.length; i++) {
      const c = img.px[i];
      if (c === 0) continue;
      out.data.set([rgb[c][0], rgb[c][1], rgb[c][2], 255], i * 4);
    }
    ctx.putImageData(out, 0, 0);
    const texture = Texture.from(canvas);
    texture.source.scaleMode = 'nearest';
    const f = { texture, ox: 0, oy: 0, scale: 1 };
    this.fallback.set(key, f);
    return f;
  }

  /** A FIRE text sprite (money, lives) rasterised like Framebuffer.text. */
  private text(text: string): Frame | null {
    return this.indexed(`t${text}`, () => {
      const f = this.data.fonts.FIRE;
      let w = 0;
      for (const ch of text) w += f.widths[cp437(ch)];
      const px = new Uint8Array(w * f.height);
      let x = 0;
      for (const ch of text) {
        const code = cp437(ch);
        const g = code * f.width * f.height;
        for (let j = 0; j < f.height; j++)
          for (let i = 0; i < f.widths[code]; i++) {
            const c = f.glyphs[g + j * f.width + i];
            if (c !== 0) px[j * w + x + i] = c;
          }
        x += f.widths[code];
      }
      return { w, h: f.height, px };
    });
  }

  /** Draw the world; false while the assets for this level are not loaded yet (draw the classic view then). */
  draw(w: World): boolean {
    if (!this.index) return false;
    if (!this.drawBackground(w)) return false;
    this.drawBars(w);
    let play = 0, hud = 0;
    const spr = w.drawn;
    for (let slot = SLOTS - 1; slot >= 0; slot--) {
      const n = spr.n[slot];
      if (n === 0) continue;
      const text = w.texts.get(n);
      const f = text !== undefined ? this.text(text) : this.frame(n);
      if (!f) continue;
      const toHud = slot <= FULL_WINDOW_SLOTS;
      const pool = toHud ? this.hudPool : this.playPool;
      const i = toHud ? hud++ : play++;
      let s = pool[i];
      if (!s) {
        s = new Sprite();
        pool.push(s);
        (toHud ? this.hud : this.playfield).addChild(s);
      }
      s.visible = true;
      s.texture = f.texture;
      s.x = (spr.x[slot] - w.drawnScrollX + f.ox) * S;
      s.y = (spr.y[slot] - w.drawnScrollY + f.oy) * S;
      s.scale.set(S / f.scale);
      const shadow = spr.mode[slot] === MODE_SHADOW;
      s.tint = shadow ? 0x000000 : 0xffffff;
      s.alpha = shadow ? this.shadowAlpha : 1;
    }
    for (let i = play; i < this.playPool.length; i++) this.playPool[i].visible = false;
    for (let i = hud; i < this.hudPool.length; i++) this.hudPool[i].visible = false;
    this.overlay.clear();
    if (w.flash) this.overlay.rect(0, 0, W * S, H * S).fill(grey(50));
    else if (w.fade < FADE_STEPS) this.overlay.rect(0, 0, W * S, H * S).fill({ color: 0, alpha: 1 - w.fade / FADE_STEPS });
    return true;
  }

  /** The visible background chunks (and the next one above, which the scroll reaches soon). */
  private drawBackground(w: World): boolean {
    const top = w.drawnScrollY - LEVEL_TOP;
    const first = Math.floor(top / this.index!.chunk);
    let ready = true;
    for (let k = 0; k < 3; k++) {
      const c = first + k;
      const s = this.chunkSprites[k];
      const tex = c >= 0 && c < CHUNKS ? this.chunk(w.level, c) : null;
      if (k < 2 && c >= 0 && c < CHUNKS && !tex) ready = false;
      s.visible = !!tex;
      if (!tex) continue;
      s.texture = tex;
      s.x = -w.drawnScrollX * S;
      s.y = (c * this.index!.chunk - top) * S;
    }
    if (first > 0) this.chunk(w.level, first - 1); // prefetch: the level scrolls up (y decreases)
    return ready;
  }

  private chunk(level: number, c: number): Texture | null {
    const key = `${level}/${c}`;
    const t = this.chunks.get(key);
    if (t && t !== 'loading') return t;
    if (!t) {
      this.chunks.set(key, 'loading');
      const method = this.method;
      Assets.load<Texture>(`${this.base()}level${level}/${c}.webp`).then((tex) => {
        if (this.method === method) this.chunks.set(key, tex);
      });
      // drop chunks of other levels and those far below the view
      for (const [k, v] of this.chunks) {
        const [l, i] = k.split('/').map(Number);
        if ((l !== level || i > c + 3) && v !== 'loading') {
          v.destroy(true);
          this.chunks.delete(k);
        }
      }
    }
    return null;
  }

  /** Framebuffer.energyBars as rectangles. */
  private drawBars(w: World): void {
    const g = this.bars.clear();
    const t = this.data.tables;
    const rgb = this.data.palette.rgb;
    for (const p of w.players) {
      const x = p.index === 0 ? 3 : 314;
      const bar = (bottom: number, value: number, max: number) => {
        for (let c = 1; c <= 33; c++) {
          if (value < (c * max) / 33) continue;
          const [r, gg, b] = rgb[0x5d + Math.trunc((c - 1) / 3)];
          g.rect(x * S, (bottom - 2 * c) * S, 3 * S, S).fill((r << 16) | (gg << 8) | b);
        }
      };
      if (p.shieldType > 0) bar(79, p.drawnShield, t.shields[p.shieldType - 1].max);
      bar(171, p.drawnLife, t.jets[p.jet - 1].max_life);
    }
  }
}

const grey = (c6: number) => {
  const c = Math.floor((c6 * 255) / 63);
  return (c << 16) | (c << 8) | c;
};

/** How much the AniVGA shadow table keeps of a colour's brightness, on average (about 0.6). */
function shadowRatio(data: GameData): number {
  const lum = (c: number[]) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  const { rgb, shadow } = data.palette;
  let sum = 0, n = 0;
  for (let i = 1; i < 256; i++) {
    const l = lum(rgb[i]);
    if (l < 30) continue;
    sum += lum(rgb[shadow[i]]) / l;
    n++;
  }
  return n ? sum / n : 0.6;
}
