// The game's text files by language. German: the original files (texts.json, CP437 decoded by
// tools/export_engine_data.py). English: src/texts/en/, plain UTF-8 files with the original names, hand-wrapped
// to the same widths and with INFO.PAS's BEGIN/END markers. A file not translated yet falls back to German.
// The line ranges the original hard-coded (DS:0x910 for the briefings, 261 for the story, 207 for the about
// text) are derived from the files, so an English section may be longer or shorter than the German one.

import type { GameData } from './data';
import type { Lang } from './i18n';

const RAW = import.meta.glob('./texts/en/*', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const ENGLISH: Record<string, string[]> = Object.fromEntries(
  Object.entries(RAW).map(([path, raw]) => [path.slice(path.lastIndexOf('/') + 1), raw.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n')]),
);

/** The English text files there are (tests). */
export const ENGLISH_FILES = Object.keys(ENGLISH);

export function gameText(data: GameData, lang: Lang, file: string): string[] {
  return (lang === 'en' && ENGLISH[file]) || data.texts[file];
}

/** The last line with text, 1-based: STORY.TXT 261 and ABOUT.TXT 207 in German. */
export function lastLine(lines: readonly string[]): number {
  for (let i = lines.length; i > 0; i--) if (lines[i - 1].trim()) return i;
  return 0;
}

/**
 * MISSIONS.PAS's sections as [first, last] line numbers (1-based): the six briefings, then the ending. A section
 * starts at a heading (a line in capitals: "MISSION 1:", "DAS ENDE") and ends at its last line with text before
 * the next heading or two empty lines. The German file gives the original's table (DS:0x910) and the ending
 * 98–119; the lines after it ("übrigens: Hast du den Cheat schon entdeckt?") stay hidden (decision 22).
 */
export function missionSections(lines: readonly string[]): [number, number][] {
  const heading = (l: string) => /^[A-ZÄÖÜ0-9 :!.]+$/.test(l) && /[A-Z]/.test(l);
  const starts = lines.flatMap((l, i) => (heading(l) ? [i] : []));
  return starts.map((h, k) => {
    const stop = k + 1 < starts.length ? starts[k + 1] : lines.length;
    let last = h;
    for (let j = h; j < stop; j++) {
      if (!lines[j].trim() && j + 1 < lines.length && !lines[j + 1].trim()) break;
      if (lines[j].trim()) last = j;
    }
    return [h + 1, last + 1];
  });
}
