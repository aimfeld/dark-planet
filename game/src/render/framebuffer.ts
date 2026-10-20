// Classic renderer core: draws a World into a 320 x 200 indexed framebuffer like AniVGA's Animate.
// No DOM here, so it also runs in tests.

import type { GameData } from '../data';
import { cp437, type PaletteName, type Screen } from '../screens/screen';
import { FADE_STEPS, MODE_SHADOW, SLOTS, type World } from '../sim/state';

export const W = 320;
export const H = 200;
// SetAnimateWindow(10, 0, 311, 199) rounds x1 down to a multiple of 4: the playfield is x 8..311.
const CLIP_X0 = 8;
const CLIP_X1 = 311;
// Animate switches to the full screen at slot 8 (SetFullWindowSlots(8) = 28be:2BDE): slots 0..8 = HUD.
const FULL_WINDOW_SLOTS = 8;

export class Framebuffer {
  readonly px = new Uint8Array(W * H);

  constructor(private readonly data: GameData) {}

  render(w: World): void {
    const px = this.px;
    px.fill(0);
    this.background(w);
    this.energyBars(w); // DrawEnergyBars runs before Animate, so the HUD frame sprites cover them
    const spr = w.drawn;
    const sx0 = w.drawnScrollX, sy0 = w.drawnScrollY;
    for (let slot = SLOTS - 1; slot >= 0; slot--) {
      const n = spr.n[slot];
      if (n === 0) continue;
      const full = slot <= FULL_WINDOW_SLOTS;
      const x0 = full ? 0 : CLIP_X0, x1 = full ? W - 1 : CLIP_X1;
      const x = spr.x[slot] - sx0, y = spr.y[slot] - sy0;
      const text = w.texts.get(n);
      if (text !== undefined) this.text(text, 'FIRE', 0, x, y, x0, x1);
      else this.sprite(n, x, y, x0, x1, spr.mode[slot] === MODE_SHADOW);
    }
  }

  /** The level's 32 x 32 tiles (row 0 at level y 168..199, see docs/file-formats.md LEV). */
  private background(w: World): void {
    const level = this.data.levels[w.level - 1];
    const tiles = this.data.tiles[w.episode - 1];
    const px = this.px;
    for (let y = 0; y < H; y++) {
      const ly = w.drawnScrollY + y;
      const row = Math.floor((199 - ly) / 32);
      if (row < 0 || row >= level.tiles.length) continue;
      const ty = ly - (168 - 32 * row);
      const cells = level.tiles[row];
      for (let x = CLIP_X0; x <= CLIP_X1; x++) {
        const lx = w.drawnScrollX + x;
        const col = lx >> 5;
        if (col < 0 || col >= 10) continue;
        px[y * W + x] = tiles[(cells[col] - 1) * 1024 + ty * 32 + (lx & 31)];
      }
    }
  }

  private sprite(n: number, x: number, y: number, x0: number, x1: number, shadow: boolean): void {
    const s = this.data.sprites.get(n);
    if (!s) return;
    const px = this.px;
    const table = this.data.palette.shadow;
    for (let j = 0; j < s.h; j++) {
      const sy = y + j;
      if (sy < 0 || sy >= H) continue;
      for (let i = 0; i < s.w; i++) {
        const sx = x + i;
        if (sx < x0 || sx > x1) continue;
        const c = s.px[j * s.w + i];
        if (c === 0) continue;
        const k = sy * W + sx;
        px[k] = shadow ? table[px[k]] : c;
      }
    }
  }

  /** A menu screen: the PIC background, then slots 920..0 over the full screen (no clip window). */
  renderScreen(sc: Screen): void {
    const px = this.px;
    if (sc.picture) px.set(this.data.pictures[sc.picture]);
    else px.fill(0);
    for (let slot = SLOTS - 1; slot >= 0; slot--) {
      const n = sc.n[slot];
      if (n === 0) continue;
      const t = sc.texts.get(n);
      if (t) this.text(t.text, t.font, t.ink, sc.x[slot], sc.y[slot], 0, W - 1);
      else this.sprite(n, sc.x[slot], sc.y[slot], 0, W - 1, false);
    }
  }

  /** A text sprite: multicolour fonts carry their own colours, mono fonts draw set pixels in `ink`. */
  private text(text: string, font: string, ink: number, x: number, y: number, x0: number, x1: number): void {
    const f = this.data.fonts[font];
    const px = this.px;
    for (const ch of text) {
      const code = cp437(ch);
      const g = code * f.width * f.height;
      for (let j = 0; j < f.height; j++) {
        const sy = y + j;
        if (sy < 0 || sy >= H) continue;
        for (let i = 0; i < f.widths[code]; i++) {
          const sx = x + i;
          const c = f.glyphs[g + j * f.width + i];
          if (c !== 0 && sx >= x0 && sx <= x1) px[sy * W + sx] = f.multicolor ? c : ink;
        }
      }
      x += f.widths[code];
    }
  }

  /**
   * DrawEnergyBars @1d9e:1176: 33 lines, 3 px wide, 2 px apart; colour 0x5D + (c - 1) div 3, black when
   * empty. Shield bar from screen y 77 up (only with a shield), life bar from y 169 up.
   */
  private energyBars(w: World): void {
    const t = this.data.tables;
    for (const p of w.players) {
      const x = p.index === 0 ? 3 : 314;
      const bar = (bottom: number, value: number, max: number) => {
        for (let c = 1; c <= 33; c++) {
          const empty = value < (c * max) / 33;
          const colour = empty ? 0 : 0x5d + Math.trunc((c - 1) / 3);
          const y = bottom - 2 * c;
          this.px.fill(colour, y * W + x, y * W + x + 3);
        }
      };
      if (p.shieldType > 0) bar(79, p.drawnShield, t.shields[p.shieldType - 1].max);
      bar(171, p.drawnLife, t.jets[p.jet - 1].max_life);
    }
  }
}

/** VGA DAC value (0..63) to 8 bits, as tools/export_engine_data.py converts the palette. */
const dac8 = (c6: number) => Math.floor((c6 * 255) / 63);

/**
 * 32-bit RGBA lookup for the palette (little-endian ABGR words for ImageData), at fade level `fade`
 * (0 = black .. FADE_STEPS = full; AniVGA's fade steps the 6-bit DAC values linearly).
 */
export function paletteLut(data: GameData, fade = FADE_STEPS, name: PaletteName = 'EPIS1'): Uint32Array {
  const lut = new Uint32Array(256);
  (name === 'EPIS1' ? data.palette.rgb : data.palette.menus[name]).forEach((rgb, i) => {
    const [r, g, b] = rgb.map((c8) => dac8(Math.trunc((Math.round((c8 * 63) / 255) * fade) / FADE_STEPS)));
    lut[i] = 0xff000000 | (b << 16) | (g << 8) | r;
  });
  return lut;
}

/** The atom-bomb flash: BombTimer fills the whole palette with DAC value 50 (FillChar(pal, 768, 50)). */
export function flashLut(): Uint32Array {
  const c = dac8(50);
  return new Uint32Array(256).fill(0xff000000 | (c << 16) | (c << 8) | c);
}
