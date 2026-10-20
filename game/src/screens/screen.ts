// The menu screens' display state: what AniVGA shows outside a level. A full-screen PIC background, the
// sprite slot table (lower slot = in front, as in the game), text sprites made in the current font, the
// palette and its fade level. The menus draw over the whole screen (no playfield clip window).

import type { GameData, Picture } from '../data';
import { FADE_STEPS, SLOTS } from '../sim/state';
import { mod } from '../sim/tp';

/** EPIS1 for the options, the text viewer and the levels; the others belong to their PIC (re-notes "Menus"). */
export type PaletteName = 'EPIS1' | 'HMBILD' | 'UMBILD';

export interface TextSprite {
  text: string;
  font: string; // key of GameData.fonts
  ink: number; // FontColor (DS:0x25B9) for mono fonts; FontBack equals it or is 0 everywhere, so the background is clear
}

export class Screen {
  picture: Picture | null = null;
  palette: PaletteName = 'EPIS1';
  fade = 0; // 0 = black .. FADE_STEPS = full palette
  readonly n = new Int32Array(SLOTS); // SpriteN
  readonly x = new Int32Array(SLOTS); // SpriteX (screen coordinates)
  readonly y = new Int32Array(SLOTS); // SpriteY
  readonly mode = new Uint8Array(SLOTS); // draw mode byte (DS:0xB820 + slot): MODE_SHADOW darkens what is behind
  readonly texts = new Map<number, TextSprite>(); // text sprites by sprite number (MakeTextSprite 1d9e:2E58)
  font = 'FIRE'; // the current font (LoadFont 28be:1B75)
  ink = 0;
  private cycleCounter = 0; // DS:0x5530

  constructor(readonly data: GameData) {}

  /** ClearScreen 0x1C0A9 / the menus' "SpriteN[1..920] := 0". */
  clear(): void {
    this.n.fill(0);
  }

  set(slot: number, n: number, x: number, y: number): void {
    this.n[slot] = n;
    this.x[slot] = x;
    this.y[slot] = y;
  }

  /** MakeTextSprite(n, s) in the current font and colour; an empty string draws nothing. */
  makeText(n: number, text: string): void {
    this.texts.set(n, { text, font: this.font, ink: this.ink });
  }

  /** Pixel width of `text` in the current font. */
  textWidth(text: string): number {
    const widths = this.data.fonts[this.font].widths;
    let w = 0;
    for (const ch of text) w += widths[cp437(ch)];
    return w;
  }

  /** SpriteWidth 1d9e:2754: AniVGA stores widths in 4-pixel units, so a text sprite is rounded up to 4. */
  spriteWidth(n: number): number {
    const t = this.texts.get(n);
    if (t) return (this.textWidth(t.text) + 3) & ~3;
    return this.data.sprites.get(n)?.w ?? 0;
  }

  /** Frame 1d9e:2A7E with episode 0: the global sprite cycles (1d9e:3105), then Animate draws. */
  cycles(): void {
    this.cycleCounter += 1;
    const n = this.n;
    for (const cy of this.data.tables.sprite_cycles.global) {
      if (mod(this.cycleCounter, cy.rate) !== 0) continue;
      for (let s = 1; s < n.length; s++) {
        if (n[s] >= cy.first && n[s] < cy.last) n[s] += 1;
        else if (n[s] === cy.last) n[s] = cy.first;
      }
    }
  }

  get faded(): boolean {
    return this.fade < FADE_STEPS;
  }
}

/** The fonts are indexed by CP437 code; texts.json holds Unicode. */
export function cp437(ch: string): number {
  const c = ch.charCodeAt(0);
  if (c < 0x80) return c;
  return UNICODE_TO_CP437.get(ch) ?? 0x3f;
}

// The upper half of CP437, for the box-drawing and other characters in the text files.
const UPPER =
  'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀' +
  'αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■\u00a0';
const UNICODE_TO_CP437 = new Map([...UPPER].map((ch, i) => [ch, 0x80 + i]));
