// The sprites with text in them (Phase 5): the main menu items and the shop panel switch with the language
// (tools/export_english_sprites.py, data.ts useSpriteLanguage).

import { describe, expect, it } from 'vitest';
import { useSpriteLanguage } from '../src/data';
import { gameData, hasData } from './helpers';

const ITEMS = Array.from({ length: 66 }, (_, i) => 613 + i); // the six items, 11 frames each
const PANEL = 501;

describe.skipIf(!hasData)('sprite language', () => {
  it('swaps the menu items and the shop panel, and back', async () => {
    const data = await gameData();
    const german = [...ITEMS, PANEL, 612].map((n) => data.sprites.get(n));
    try {
      useSpriteLanguage(data, 'en');
      for (const n of [...ITEMS, PANEL]) {
        expect(data.sprites.get(n)).toBe(data.spriteVariants.en.get(n));
        expect(data.sprites.get(n)).not.toBe(german[[...ITEMS, PANEL].indexOf(n)]);
      }
      expect(data.sprites.get(612)).toBe(german.at(-1)); // the hangar's pointer, no text
      const panel = data.sprites.get(PANEL)!;
      expect([panel.w, panel.h]).toEqual([german[ITEMS.length]!.w, german[ITEMS.length]!.h]);
      for (const n of ITEMS) {
        const s = data.sprites.get(n)!;
        expect(s.w % 4).toBe(0); // AniVGA sprite widths
        expect(s.w).toBeLessThanOrEqual(200);
        expect(s.h).toBeLessThanOrEqual(40); // the items are 25 px apart and overlap a little, as the originals
      }
      useSpriteLanguage(data, 'de');
      expect([...ITEMS, PANEL, 612].map((n) => data.sprites.get(n))).toEqual(german);
    } finally {
      useSpriteLanguage(data, 'de');
    }
  });
});
