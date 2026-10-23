// The languages (Phase 5): the default, the derived text ranges, the English files' structure, and that every
// string fits where it is drawn (measured with the game's fonts).

import { describe, expect, it } from 'vitest';
import { LANGUAGES, strings, systemLanguage, type Lang } from '../src/i18n';
import { Screen } from '../src/screens/screen';
import { ENGLISH_FILES, gameText, lastLine, missionSections } from '../src/texts';
import { gameData, hasData } from './helpers';

describe('i18n', () => {
  it('defaults to German for a German system language, else English', () => {
    expect(systemLanguage(['de-CH', 'en'])).toBe('de');
    expect(systemLanguage(['de'])).toBe('de');
    expect(systemLanguage(['en-US', 'de'])).toBe('en');
    expect(systemLanguage(['fr-CH'])).toBe('en');
    expect(systemLanguage([])).toBe('en');
  });
});

describe.skipIf(!hasData)('texts', () => {
  it("derives the original's line ranges from the German files", async () => {
    const data = await gameData();
    // DS:0x910 + 4 level, and the ending without the cheat question (decision 22)
    expect(missionSections(data.texts['MISSIONS.PAS'])).toEqual([[1, 14], [16, 30], [32, 47], [49, 64], [66, 79], [81, 96], [98, 119]]);
    expect(lastLine(data.texts['STORY.TXT'])).toBe(261);
    expect(lastLine(data.texts['ABOUT.TXT'])).toBe(207); // spec §12 #20
  });

  it('English files keep the German structure', async () => {
    const data = await gameData();
    for (const file of ENGLISH_FILES) {
      expect(Object.keys(data.texts), file).toContain(file);
      const de = data.texts[file];
      const en = gameText(data, 'en', file);
      if (file === 'MISSIONS.PAS') {
        const sections = missionSections(en);
        expect(sections).toHaveLength(7);
        for (const [first, last] of sections.slice(0, 6)) expect(last - first + 1).toBeLessThanOrEqual(20); // a briefing's screen
      }
      if (file === 'INFO.PAS') {
        const markers = (lines: string[]) => lines.filter((l) => /^(BEGIN|END)\b/.test(l));
        expect(markers(en)).toEqual(markers(de));
      }
    }
  });
});

describe.skipIf(!hasData)('every string fits', () => {
  const measure = async () => {
    const s = new Screen(await gameData());
    return (font: string, text: string) => {
      s.font = font;
      return s.textWidth(text);
    };
  };

  it.each(LANGUAGES)('%s: menus, hangar, shop, messages', async (lang: Lang) => {
    const width = await measure();
    const t = strings(lang);
    const fits = (font: string, text: string, x: number, right = 320) => expect(x + width(font, text), `${lang} ${text}`).toBeLessThanOrEqual(right);
    const centred = (font: string, text: string) => fits(font, text, 160 - (width(font, text) >> 1));
    // Start screen (start.ts: buttons at x 118, the texts centred in SUPER)
    t.versions.forEach((v, i) => fits(i === 2 ? 'DEFAULT' : 'BROADWA', v, 118));
    fits('DEFAULT', t.languageLine, 118);
    [...t.intro, ...t.versionHint('HD'), ...t.versionHint('R')].forEach((l) => centred('SUPER', l));
    // Options (BROADWA lines at x 70)
    for (const c of t.controls) fits('BROADWA', t.controlLine(1, c), 70);
    for (const l of [t.cdSound + t.off, t.soundEffects + t.off, t.graphics + 'Remastered', t.languageLine, t.leaveMenu]) fits('BROADWA', l, 70);
    // Hangar labels, centred in BROADWA
    [...t.hangarItems, t.joinQuestion, t.cantSwitchBack].forEach((l) => centred('BROADWA', l));
    // Save protection message (DEFAULT at x 4)
    t.cheated.forEach((l) => fits('DEFAULT', l, 4));
    // Shop: no wider than the original's longest category, and a refund of 6 digits in the info box
    const de = strings('de');
    const catMax = Math.max(...de.categories.map((c) => width('DEFAULT', c)));
    t.categories.forEach((c) => expect(width('DEFAULT', c), c).toBeLessThanOrEqual(catMax));
    const boxMax = Math.max(width('DEFAULT', de.refund + '999999'), width('DEFAULT', de.invested + '999999'));
    for (const l of [t.refund + '999999', t.invested + '999999', t.noText]) expect(width('DEFAULT', l), l).toBeLessThanOrEqual(boxMax);
  });

  it('English text files: as wide as the German ones at most', async () => {
    const data = await gameData();
    const width = await measure();
    // The text viewer's files in SUPER, INFO.PAS in the shop's DEFAULT
    const font = (file: string) => (file === 'INFO.PAS' ? 'DEFAULT' : 'SUPER');
    // INFO.PAS: only the lines the shop shows (inside ART and SPEZIAL blocks), not its header comment
    const shown = (file: string, lines: string[]) => {
      if (file !== 'INFO.PAS') return lines;
      let inside = false;
      return lines.filter((l) => {
        if (/^BEGIN (ART|SPEZIAL)/.test(l)) inside = true;
        else if (/^END (ART|SPEZIAL)/.test(l)) inside = false;
        else return inside;
        return false;
      });
    };
    for (const file of ENGLISH_FILES) {
      const max = Math.max(...shown(file, data.texts[file]).map((l) => width(font(file), l)));
      for (const l of shown(file, gameText(data, 'en', file))) expect(width(font(file), l), `${file}: ${l}`).toBeLessThanOrEqual(max);
    }
  });
});
