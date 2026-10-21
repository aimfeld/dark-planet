// Remastered renderer: draws a World or a menu Screen with the 4x upscaled graphics from
// tools/remaster_upscale.py (game/public/remaster/<method>/) instead of the 320 x 200 framebuffer. It mirrors
// Framebuffer.render and renderScreen: background (level chunks or the PIC), energy bars, then slots 920..0 (in
// a level, slots 0..8 = HUD over the full screen, the others clipped to the playfield x 8..311).
// Smooth motion: positions are interpolated between the last two ticks (beforeTick keeps the older one), so
// the 40 Hz simulation moves at the display's refresh rate; a slot that jumps further than SNAP is not
// interpolated (a reused slot, a new level). Sprites without an upscaled version are nearest-scaled.
// Effects (fx.ts): glow, light and particles, and soft shadows (each run of shadow slots is drawn into
// its own blurred container, so the drawing order stays the original's). A hit flash is an additive copy of the
// sprite right after it.

import { Assets, BlurFilter, Container, detectAvif, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import type { GameData } from '../data';
import { cp437, type PaletteName, type Screen } from '../screens/screen';
import { FADE_STEPS, MODE_SHADOW, SLOTS, SpriteTable, type World } from '../sim/state';
import { H, W } from './framebuffer';
import { Fx } from './fx';

export type RemasterMethod = 'hq4x';
export const REMASTER_METHOD: RemasterMethod = 'hq4x'; // chosen by the user (session 17) over xbr4 and Real-ESRGAN

const S = 4; // upscale factor of the assets
const CLIP_X0 = 8;
const CLIP_X1 = 311;
const FULL_WINDOW_SLOTS = 8;
const LEVEL_TOP = -6200; // level y of the first background row
const CHUNKS = 25;
const SNAP = 32; // source px per tick: a slot moving further jumps instead of gliding
const TEXT_CACHE = 400; // text sprites kept built

type Entry = [group: string, page: number, x: number, y: number, w: number, h: number, ox: number, oy: number];

interface Index {
  scale: number;
  chunk: number;
  groups: Record<string, number>;
  sprites: Record<PaletteName, Record<string, Entry>>;
  pictures: Record<string, string>;
  fonts: Record<string, { file: string; cell: [number, number]; glyphs: Record<string, [number, number]> }>;
}

interface Frame {
  texture: Texture;
  ox: number; // where the trimmed picture starts in the sprite (source px)
  oy: number;
  scale: number; // texture px per source px
}

export class HiResView {
  readonly root = new Container();
  private readonly level = new Container();
  private readonly background = new Container();
  private readonly playfield = new Container(); // segments: runs of slots, shadow runs blurred
  private readonly segments: Container[] = [];
  private readonly segmentShadow: boolean[] = [];
  private readonly shadowBlur = new BlurFilter({ strength: 4, quality: 2 });
  private readonly fx: Fx;
  private readonly hud = new Container();
  private readonly bars = new Graphics();
  private readonly menu = new Container();
  private readonly picture = new Sprite();
  private readonly menuSprites = new Container();
  private readonly overlay = new Graphics();
  private readonly pools = new Map<Container, Container[]>(); // reused children per layer, in drawing order
  private readonly chunkSprites: Sprite[] = [];
  private readonly shadowAlpha: number;
  private readonly fallback = new Map<string, Frame>(); // nearest-scaled indexed sprites
  private readonly frames = new Map<string, Frame>(); // upscaled sprites by palette and number
  private readonly glyphs = new Map<string, Texture>();
  private readonly texts = new Map<string, Container>();
  private readonly textures = new Map<string, Texture | 'loading'>(); // pages, pictures, fonts, chunks
  private index: Index | null = null;
  private method: RemasterMethod | null = null;
  private avif: Promise<boolean> | null = null;
  // the tick before the last, for interpolation
  private readonly prevWorld = new SpriteTable();
  private prevScrollY = 0;
  private prevWorldValid = false;
  private readonly prevScreen = new SpriteTable();
  private prevScreenValid = false;

  constructor(private readonly data: GameData) {
    const clip = new Graphics().rect(CLIP_X0 * S, 0, (CLIP_X1 - CLIP_X0 + 1) * S, H * S).fill(0xffffff);
    const clipped = new Container();
    this.fx = new Fx(data);
    clipped.addChild(this.background, this.fx.ground, this.playfield, this.fx.top);
    clipped.mask = clip;
    this.level.addChild(clip, this.bars, clipped, this.hud);
    this.menu.addChild(this.picture, this.menuSprites);
    this.root.addChild(this.level, this.menu, this.overlay);
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

  /**
   * Switch the asset set (null = off). Textures load on demand; until then the draw calls return false. The files
   * are AVIF (Safari 16.4+, Chrome 85+, Firefox 93+); a browser without it keeps the classic graphics.
   */
  async use(method: RemasterMethod | null): Promise<void> {
    if (method === this.method) return;
    this.method = method;
    this.index = null;
    if (!method) return; // keep the textures: switching back is instant
    if (!(await (this.avif ??= detectAvif.test()))) return;
    const res = await fetch(`${this.base()}index.json`);
    const index = (await res.json()) as Index;
    if (this.method === method) this.index = index;
  }

  /**
   * Load what level `level` shows first (called in the hangar, so it loads during the briefing): the background
   * chunks at its start (scroll y 0, the bottom of the level) and the sprite pages of the level's groups.
   */
  prefetch(level: number): void {
    if (!this.index) return;
    const start = Math.floor(-LEVEL_TOP / this.index.chunk);
    for (let c = start; c > start - 3 && c >= 0; c--) this.texture(`level${level}/${c}.avif`, false);
    for (const group of ['common', level <= 3 ? 'episode1' : 'episode2']) {
      for (let p = 0; p < (this.index.groups[group] ?? 0); p++) this.texture(`${group}_${p}.avif`);
    }
  }

  /** Before each simulation tick: keep what the last tick drew, so frames until the next one can interpolate. */
  beforeTick(view: 'screen' | 'world' | 'video', w: World, sc: Screen): void {
    this.prevWorldValid = view === 'world';
    this.prevScreenValid = view === 'screen';
    if (view === 'world') {
      this.prevWorld.copyFrom(w.drawn);
      this.prevScrollY = w.drawnScrollY;
    } else if (view === 'screen') {
      const p = this.prevScreen;
      p.n.set(sc.n);
      p.x.set(sc.x);
      p.y.set(sc.y);
    }
  }

  /** After each simulation tick: the effects' events (explosions starting, shots appearing and ending). */
  afterTick(view: 'screen' | 'world' | 'video', w: World): void {
    if (view !== 'world' || !this.index) return;
    this.fx.afterTick(w, this.prevWorldValid ? this.prevWorld : null);
  }

  private base(): string {
    return `${import.meta.env.BASE_URL}remaster/${this.method}/`;
  }

  /** A texture by file name, or null while it loads. */
  private texture(file: string, mipmaps = true): Texture | null {
    const t = this.textures.get(file);
    if (t && t !== 'loading') return t;
    if (!t) {
      this.textures.set(file, 'loading');
      Assets.load<Texture>({ src: `${this.base()}${file}`, data: { autoGenerateMipmaps: mipmaps } }).then(
        (tex) => this.textures.set(file, tex),
        () => this.textures.delete(file), // try again later
      );
    }
    return null;
  }

  /** The upscaled frame of sprite n in `palette`; the indexed one (nearest) if it has none or its page still loads. */
  private frame(n: number, palette: PaletteName): Frame | null {
    const key = `${palette}/${n}`;
    const known = this.frames.get(key);
    if (known) return known;
    const entry = this.index!.sprites[palette]?.[n];
    const page = entry && this.texture(`${entry[0]}_${entry[1]}.avif`);
    if (!entry || !page) {
      return this.indexed(`s${key}`, palette, () => {
        const s = this.data.sprites.get(n);
        return s ? { w: s.w, h: s.h, px: s.px } : null;
      });
    }
    const [, , x, y, w, h, ox, oy] = entry;
    const f = { texture: new Texture({ source: page.source, frame: new Rectangle(x, y, w, h) }), ox, oy, scale: S };
    this.frames.set(key, f);
    return f;
  }

  private rgb(palette: PaletteName): number[][] {
    return palette === 'EPIS1' ? this.data.palette.rgb : this.data.palette.menus[palette];
  }

  /** A texture made from palette indices, drawn 4x with nearest-neighbour scaling. */
  private indexed(key: string, palette: PaletteName, make: () => { w: number; h: number; px: Uint8Array } | null): Frame | null {
    const known = this.fallback.get(key);
    if (known) return known;
    const img = make();
    if (!img || img.w === 0 || img.h === 0) return null;
    const canvas = document.createElement('canvas');
    canvas.width = img.w;
    canvas.height = img.h;
    const ctx = canvas.getContext('2d')!;
    const out = ctx.createImageData(img.w, img.h);
    const rgb = this.rgb(palette);
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

  /** A text sprite from upscaled glyphs (Framebuffer.text), mono fonts tinted with the ink colour; null while the font loads. */
  private text(text: string, font: string, ink: number, palette: PaletteName): Container | null {
    const key = `${font}|${ink}|${palette}|${text}`;
    const known = this.texts.get(key);
    if (known) return known;
    const fi = this.index!.fonts[font];
    const page = fi && this.texture(fi.file, false);
    if (!page) return null;
    const f = this.data.fonts[font];
    const [r, g, b] = f.multicolor ? [255, 255, 255] : this.rgb(palette)[ink];
    const c = new Container();
    let x = 0;
    for (const ch of text) {
      const code = cp437(ch);
      let t = this.glyphs.get(`${font}/${code}`);
      if (!t) {
        const [gx, gy] = fi.glyphs[code];
        t = new Texture({ source: page.source, frame: new Rectangle(gx, gy, fi.cell[0], fi.cell[1]) });
        this.glyphs.set(`${font}/${code}`, t);
      }
      const s = new Sprite(t);
      s.x = x * S;
      s.tint = (r << 16) | (g << 8) | b;
      c.addChild(s);
      x += f.widths[code];
    }
    if (this.texts.size >= TEXT_CACHE) {
      for (const old of this.texts.values()) {
        old.removeFromParent();
        old.destroy({ children: true });
      }
      this.texts.clear();
    }
    this.texts.set(key, c);
    return c;
  }

  /** The level; false while its background is not loaded yet (draw the classic view then). */
  draw(w: World, alpha: number): boolean {
    if (!this.index) return false;
    const lerp = this.prevWorldValid;
    const dScroll = w.drawnScrollY - this.prevScrollY;
    const scrollY = lerp && Math.abs(dScroll) <= SNAP ? w.drawnScrollY - dScroll * (1 - alpha) : w.drawnScrollY;
    if (!this.drawBackground(w, scrollY)) return false;
    this.level.visible = true;
    this.menu.visible = false;
    this.drawBars(w);
    const spr = w.drawn, prev = this.prevWorld;
    const used = new Map<Container, number>();
    this.fx.begin(w.drawnScrollX, scrollY, alpha, this.root.scale.x * S);
    this.shadowBlur.strength = 0.35 * this.root.scale.x * S;
    let segment = -1;
    for (let slot = SLOTS - 1; slot >= 0; slot--) {
      const n = spr.n[slot];
      if (n === 0) continue;
      // x in level coordinates against the current scroll x (the quake shakes it), y on the screen
      let x = spr.x[slot];
      let y = spr.y[slot] - w.drawnScrollY;
      if (lerp && prev.n[slot] !== 0) {
        const dx = x - prev.x[slot], dy = y - (prev.y[slot] - this.prevScrollY);
        if (Math.abs(dx) <= SNAP && Math.abs(dy) <= SNAP) {
          x -= dx * (1 - alpha);
          y -= dy * (1 - alpha);
        }
      }
      x -= w.drawnScrollX;
      const shadow = spr.mode[slot] === MODE_SHADOW;
      let layer = this.hud;
      if (slot > FULL_WINDOW_SLOTS) {
        if (segment < 0 || shadow !== this.segmentShadow[segment]) segment = this.segment(segment + 1, shadow);
        layer = this.segments[segment];
      }
      const text = w.texts.get(n);
      if (text !== undefined) {
        this.placeText(layer, used, this.text(text, 'FIRE', 0, 'EPIS1'), x, y);
        continue;
      }
      const f = this.frame(n, 'EPIS1');
      this.placeSprite(layer, used, f, x, y, shadow);
      if (f && !shadow && layer !== this.hud) {
        this.fx.sprite(n, f, x, y, slot);
        const flash = this.fx.flash(slot);
        for (let a = flash?.alpha ?? 0; a > 0.01; a -= 1) {
          const s = this.placeSprite(layer, used, f, x, y, false)!;
          s.blendMode = 'add';
          s.tint = flash!.tint;
          s.alpha = Math.min(1, a);
        }
      }
    }
    for (let i = segment + 1; i < this.segments.length; i++) this.segments[i].visible = false;
    this.fx.end();
    this.finish(used, [this.hud, ...this.segments]);
    this.fade(w.flash, w.fade);
    return true;
  }

  /** A menu screen (main menu, hangar, options, shop, text viewer); false while its picture loads. */
  drawScreen(sc: Screen, alpha: number): boolean {
    if (!this.index) return false;
    if (sc.picture) {
      const file = this.index.pictures[`${sc.picture}_${sc.palette}`];
      const t = file ? this.texture(file) : null;
      if (!t) return false;
      this.picture.texture = t;
      this.picture.visible = true;
    } else {
      this.picture.visible = false;
    }
    this.level.visible = false;
    this.menu.visible = true;
    const prev = this.prevScreen, lerp = this.prevScreenValid;
    const used = new Map<Container, number>();
    for (let slot = SLOTS - 1; slot >= 0; slot--) {
      const n = sc.n[slot];
      if (n === 0) continue;
      let x = sc.x[slot], y = sc.y[slot];
      if (lerp && prev.n[slot] !== 0) {
        const dx = x - prev.x[slot], dy = y - prev.y[slot];
        if (Math.abs(dx) <= SNAP && Math.abs(dy) <= SNAP) {
          x -= dx * (1 - alpha);
          y -= dy * (1 - alpha);
        }
      }
      const t = sc.texts.get(n);
      if (t) this.placeText(this.menuSprites, used, this.text(t.text, t.font, t.ink, sc.palette), x, y);
      else this.placeSprite(this.menuSprites, used, this.frame(n, sc.palette), x, y, sc.mode[slot] === MODE_SHADOW);
    }
    this.finish(used, [this.menuSprites]);
    this.fade(false, sc.fade);
    return true;
  }

  /** Playfield segment i, blurred if it holds shadows; returns i. */
  private segment(i: number, shadow: boolean): number {
    let c = this.segments[i];
    if (!c) {
      c = new Container();
      this.segments.push(c);
      this.segmentShadow.push(false);
      this.playfield.addChild(c);
    }
    c.visible = true;
    if (this.segmentShadow[i] !== shadow) {
      this.segmentShadow[i] = shadow;
      c.filters = shadow ? [this.shadowBlur] : [];
    }
    return i;
  }

  /** The next pooled sprite of `layer`, showing frame f at (x, y) source px. */
  private placeSprite(layer: Container, used: Map<Container, number>, f: Frame | null, x: number, y: number, shadow: boolean): Sprite | null {
    if (!f) return null;
    const s = this.next(layer, used, 'sprite') as Sprite;
    s.blendMode = 'normal';
    s.texture = f.texture;
    s.x = Math.round((x + f.ox) * S);
    s.y = Math.round((y + f.oy) * S);
    s.scale.set(S / f.scale);
    s.tint = shadow ? 0x000000 : 0xffffff;
    s.alpha = shadow ? this.shadowAlpha : 1;
    return s;
  }

  private placeText(layer: Container, used: Map<Container, number>, text: Container | null, x: number, y: number): void {
    if (!text) return;
    const holder = this.next(layer, used, 'holder');
    if (holder.children[0] !== text) {
      holder.removeChildren();
      holder.addChild(text);
    }
    holder.x = Math.round(x * S);
    holder.y = Math.round(y * S);
  }

  /** Layer children are reused in drawing order: a Sprite, or a holder Container for a text. */
  private next(layer: Container, used: Map<Container, number>, kind: 'sprite' | 'holder'): Container {
    let pool = this.pools.get(layer);
    if (!pool) this.pools.set(layer, (pool = []));
    const i = used.get(layer) ?? 0;
    used.set(layer, i + 1);
    let c = pool[i];
    if (!c || c instanceof Sprite !== (kind === 'sprite')) {
      const fresh = kind === 'sprite' ? new Sprite() : new Container();
      if (c) {
        layer.addChildAt(fresh, layer.getChildIndex(c));
        c.removeFromParent();
        c.removeChildren(); // a holder's text stays cached
        c.destroy();
      } else {
        layer.addChild(fresh);
      }
      pool[i] = c = fresh;
    }
    c.visible = true;
    return c;
  }

  private finish(used: Map<Container, number>, layers: Container[]): void {
    for (const layer of layers) {
      const pool = this.pools.get(layer) ?? [];
      for (let i = used.get(layer) ?? 0; i < pool.length; i++) pool[i].visible = false;
    }
  }

  /** Palette fades as a black overlay; the atom-bomb flash fills the palette with DAC value 50. */
  private fade(flash: boolean, fade: number): void {
    this.overlay.clear();
    if (flash) this.overlay.rect(0, 0, W * S, H * S).fill(grey(50));
    else if (fade < FADE_STEPS) this.overlay.rect(0, 0, W * S, H * S).fill({ color: 0, alpha: 1 - Math.max(0, fade) / FADE_STEPS });
  }

  /** The visible background chunks at (interpolated) scroll y; the next one above loads ahead. */
  private drawBackground(w: World, scrollY: number): boolean {
    const top = scrollY - LEVEL_TOP;
    const chunk = this.index!.chunk;
    const first = Math.floor(top / chunk);
    let ready = true;
    for (let k = 0; k < 3; k++) {
      const c = first + k;
      const s = this.chunkSprites[k];
      const inLevel = c >= 0 && c < CHUNKS && c * chunk < top + H;
      const tex = inLevel ? this.texture(`level${w.level}/${c}.avif`, false) : null;
      if (inLevel && !tex) ready = false;
      s.visible = !!tex;
      if (!tex) continue;
      s.texture = tex;
      s.x = -w.drawnScrollX * S;
      s.y = Math.round((c * chunk - top) * S);
    }
    if (first > 0) this.texture(`level${w.level}/${first - 1}.avif`, false); // the level scrolls up (y decreases)
    this.dropChunks(w.level, first);
    return ready;
  }

  /** Free the chunks of other levels and those that scrolled out below. */
  private dropChunks(level: number, first: number): void {
    for (const [file, t] of this.textures) {
      const m = /^level(\d)\/(\d+)\.avif$/.exec(file);
      if (!m || t === 'loading') continue;
      if (Number(m[1]) !== level || Number(m[2]) > first + 3) {
        this.textures.delete(file);
        for (const s of this.chunkSprites) if (s.texture === t) s.texture = Texture.EMPTY;
        void Assets.unload(`${this.base()}${file}`);
      }
    }
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
