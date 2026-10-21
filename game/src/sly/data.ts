// The prototype's files, exported by tools/export_sly_data.py (game/public/sly/): sprites by file name, the tiles,
// the FIRE font, RAUM.PAL and LEVEL2.LEV's tile grid.

import { gunzip, Sprite, type RawData } from '../data';

export interface SlyFont {
  width: number;
  height: number;
  widths: number[];
  glyphs: Uint8Array; // 256 x height x width palette indices, 0 = transparent (FIRE is multicolour)
}

export interface SlyData {
  files: Record<string, Sprite[]>; // the sprites of each .COD / .LIB, in file order
  font: SlyFont;
  palette: { rgb: number[][]; shadow: number[] }; // RAUM.PAL (8 bit per channel), SetShadowTab(50)
  level: number[][]; // 100 rows x 10 columns of 32 x 32 tile numbers (1-based), row 0 = the level's bottom
}

interface Index {
  palette: SlyData['palette'];
  files: Record<string, [number, number, number][]>;
  font: { width: number; height: number; widths: number[]; offset: number };
  level: number[][];
}

export async function loadSlyData(raw: RawData): Promise<SlyData> {
  const [index, bin] = await Promise.all([
    raw.json('sly.json') as Promise<Index>,
    raw.binary('graphics.bin.gz').then(gunzip),
  ]);
  const files: Record<string, Sprite[]> = {};
  for (const [name, sprites] of Object.entries(index.files)) {
    files[name] = sprites.map(([offset, w, h]) => new Sprite(w, h, new Uint8Array(bin, offset, w * h)));
  }
  const f = index.font;
  return {
    files,
    font: { width: f.width, height: f.height, widths: f.widths, glyphs: new Uint8Array(bin, f.offset, 256 * f.width * f.height) },
    palette: index.palette,
    level: index.level,
  };
}
