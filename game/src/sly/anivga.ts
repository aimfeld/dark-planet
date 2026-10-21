// The parts of AniVGA 1.2 the prototype uses: the sprite slot table in virtual (level) coordinates, sprites loaded
// by number, shadow sprites, sprite cycles, text sprites, HitDetect and the palette with FadeToPalette.
// Dark Planet uses the same library (docs/re-notes.md); the prototype's own settings are in sim.ts.

import type { Sprite } from '../data';
import { hitDetectIn } from '../sim/sprites';
import type { SlyData } from './data';

export const NMAX = 900; // slots 0..NMAX (the prototype uses up to 441)
export const RETRACE_MS = 1000 / 70; // FadeToPalette sets one palette step per vertical retrace

export class AniVga {
  // Integer in AniVGA, so the arrays wrap like the original
  readonly n = new Int16Array(NMAX + 1); // SpriteN: the load number shown in the slot, 0 = none
  readonly x = new Int16Array(NMAX + 1); // SpriteX, SpriteY: virtual coordinates
  readonly y = new Int16Array(NMAX + 1);
  startVirtualX = 0; // the screen's top left corner in virtual coordinates
  startVirtualY = 0;
  readonly sprites = new Map<number, Sprite>(); // by load number
  readonly shadow = new Set<number>(); // load numbers with SetModeByte(n, Display_SHADOWEXACT)
  readonly texts = new Map<number, string>(); // MakeTextSprite: load number -> text
  private readonly next = new Map<number, number>(); // SetSpriteCycle: load number -> its successor
  /** The palette as the DAC holds it: 768 six-bit values. */
  readonly palette = new Uint8Array(768);

  constructor(private readonly data: SlyData) {}

  /** LoadSprite(name, n): a .LIB's sprites get the numbers n, n + 1, ... A missing file loads nothing. */
  loadSprite(name: string, nr: number): number {
    const list = this.data.files[name.toUpperCase()] ?? [];
    list.forEach((s, i) => this.sprites.set(nr + i, s));
    return list.length;
  }

  /** SetModeByte(n, Display_SHADOWEXACT): the sprite darkens what is behind it (SetShadowTab) instead of drawing. */
  setShadow(nr: number): void {
    this.shadow.add(nr);
  }

  /** SetSpriteCycle(n, len): a slot showing n + i shows n + i + 1 after the next Animate (n + len - 1 -> n). */
  setSpriteCycle(nr: number, len: number): void {
    for (let i = 0; i < len; i++) this.next.set(nr + i, i === len - 1 ? nr : nr + i + 1);
  }

  /** MakeTextSprite(s, n) in the loaded font (FIRE.FNT). */
  makeTextSprite(text: string, nr: number): void {
    this.texts.set(nr, text);
  }

  /** Animate's sprite cycle step, before it draws each slot (the drawing is framebuffer.ts's job). */
  animate(): void {
    const n = this.n;
    for (let i = 0; i <= NMAX; i++) {
      const succ = this.next.get(n[i]);
      if (succ !== undefined) n[i] = succ;
    }
  }

  hitDetect(a: number, b: number): boolean {
    return hitDetectIn(this, this, a, b);
  }

  /** SetPalette: 8-bit RGB triplets (as exported) to DAC values. */
  setPalette(rgb: number[][]): void {
    rgb.forEach((c, i) => c.forEach((v, k) => (this.palette[3 * i + k] = Math.round((v * 63) / 255))));
  }

  /**
   * FadeToPalette(target, steps) @14e4:027F: steps - 1 palettes from + (target - from) * i div (steps - 1) for
   * i = 0..steps - 2, then the target; each SetPalette waits for a vertical retrace. Yields the time each step shows.
   */
  *fadeToPalette(target: Uint8Array, steps: number): Generator<number, void, void> {
    const from = this.palette.slice();
    for (let i = 0; i <= steps - 2; i++) {
      for (let j = 0; j < 768; j++) this.palette[j] = from[j] + Math.trunc(((target[j] - from[j]) * i) / (steps - 1));
      yield RETRACE_MS;
    }
    this.palette.set(target);
    yield RETRACE_MS;
  }
}
