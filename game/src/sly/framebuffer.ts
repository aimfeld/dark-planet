// The prototype's picture like AniVGA's Animate draws it: the tiles in the animation window, the energy bars,
// then the slots NMAX..0 (lower slots in front), slots 0..8 over the whole screen (SetSplitIndex(8)), the others
// clipped to the window. Outside the window (x 0-7, 312-319, row 0) Animate refreshes the screen only in its first
// two frames (UpdateOuterArea = 2), when the background there is black: it stays black but for the HUD sprites and
// the energy bars' PutPixel lines (black row 0 in the DOSBox-X captures). No DOM here, so it also runs in tests.
// Details: docs/re-notes.md "SLYVERS".

import { NMAX } from './anivga';
import type { SlyData } from './data';
import type { Sly } from './sim';

export const W = 320;
export const H = 200;
// SetAnimateWindow(8, 1, 312, 199): AniVGA rounds x1 and the width down to multiples of 4
const CLIP_X0 = 8;
const CLIP_X1 = 311;
const CLIP_Y0 = 1;
const CLIP_Y1 = 199;
const SPLIT_INDEX = 8; // SetSplitIndex(8)
/** InitLevel's Kachel(x, 200 - 32 - (i2 - 1) * 32): AniVGA puts tiles on its 16 px grid, so row 1 starts at y 160. */
const TILE_Y0 = 160;

export class SlyFramebuffer {
  readonly px = new Uint8Array(W * H);

  constructor(private readonly data: SlyData) {}

  render(sly: Sly): void {
    const a = sly.a;
    const px = this.px;
    px.fill(0);
    const level = this.data.level;
    const tiles = this.data.files['BACK1-14.LIB'];
    for (let y = CLIP_Y0; y <= CLIP_Y1; y++) {
      const ly = a.startVirtualY + y;
      const row = Math.floor((TILE_Y0 + 31 - ly) / 32);
      if (row < 0 || row >= level.length) continue;
      const ty = ly - (TILE_Y0 - 32 * row);
      for (let x = CLIP_X0; x <= CLIP_X1; x++) {
        const lx = a.startVirtualX + x;
        const col = lx >> 5;
        if (col < 0 || col >= level[row].length) continue;
        px[y * W + x] = tiles[level[row][col] - 1].px[ty * 32 + (lx & 31)];
      }
    }
    // PEnergieAnzeige's PutPixel lines (screen coordinates when drawn): x 3..5, y 79 - 2 * i (shield), 171 - 2 * i
    const bar = (colours: Uint8Array, bottom: number) => {
      for (let i = 1; i <= 33; i++) {
        const y = bottom - 2 * i;
        px.fill(colours[i], y * W + 3, y * W + 6);
      }
    };
    bar(sly.bars.shield, 79);
    bar(sly.bars.energie, 171);
    for (let slot = NMAX; slot >= 0; slot--) {
      const n = a.n[slot];
      if (n <= 0) continue;
      const full = slot <= SPLIT_INDEX;
      const x0 = full ? 0 : CLIP_X0, x1 = full ? W - 1 : CLIP_X1;
      const y0 = full ? 0 : CLIP_Y0, y1 = full ? H - 1 : CLIP_Y1;
      const x = a.x[slot] - a.startVirtualX, y = a.y[slot] - a.startVirtualY;
      const text = a.texts.get(n);
      if (text !== undefined) this.text(text, x, y, x0, x1, y0, y1);
      else this.sprite(sly, n, x, y, x0, x1, y0, y1);
    }
  }

  private sprite(sly: Sly, n: number, x: number, y: number, x0: number, x1: number, y0: number, y1: number): void {
    const s = sly.a.sprites.get(n);
    if (!s) return;
    const shadow = sly.a.shadow.has(n);
    const table = this.data.palette.shadow;
    const px = this.px;
    for (let j = 0; j < s.h; j++) {
      const sy = y + j;
      if (sy < y0 || sy > y1) continue;
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

  /** A text sprite in FIRE.FNT (multicolour: the glyphs carry their palette indices). */
  private text(text: string, x: number, y: number, x0: number, x1: number, y0: number, y1: number): void {
    const f = this.data.font;
    const px = this.px;
    for (const ch of text) {
      const code = ch.charCodeAt(0) & 0xff;
      const g = code * f.width * f.height;
      for (let j = 0; j < f.height; j++) {
        const sy = y + j;
        if (sy < y0 || sy > y1) continue;
        for (let i = 0; i < f.widths[code]; i++) {
          const sx = x + i;
          const c = f.glyphs[g + j * f.width + i];
          if (c !== 0 && sx >= x0 && sx <= x1) px[sy * W + sx] = c;
        }
      }
      x += f.widths[code];
    }
  }
}
