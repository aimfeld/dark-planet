import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadGameData, type GameData } from '../src/data';

export const DATA_DIR = join(__dirname, '..', 'public', 'data');
export const hasData = existsSync(join(DATA_DIR, 'tables.json'));

let cached: Promise<GameData> | undefined;

/** The exported game data (local only: run `npm run data` first). */
export function gameData(): Promise<GameData> {
  cached ??= loadGameData({
    json: async (name) => JSON.parse(readFileSync(join(DATA_DIR, name), 'utf8')),
    binary: async (name) => {
      const b = readFileSync(join(DATA_DIR, name));
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    },
  });
  return cached;
}

/** Write an 8-bit indexed BMP (for looking at rendered frames). */
export function bmp(px: Uint8Array, w: number, h: number, rgb: number[][]): Buffer {
  const rowSize = (w + 3) & ~3;
  const size = 54 + 1024 + rowSize * h;
  const b = Buffer.alloc(size);
  b.write('BM', 0);
  b.writeUInt32LE(size, 2);
  b.writeUInt32LE(54 + 1024, 10);
  b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18);
  b.writeInt32LE(h, 22);
  b.writeUInt16LE(1, 26);
  b.writeUInt16LE(8, 28);
  b.writeUInt32LE(256, 46);
  rgb.forEach(([r, g, bl], i) => {
    b[54 + 4 * i] = bl;
    b[55 + 4 * i] = g;
    b[56 + 4 * i] = r;
  });
  for (let y = 0; y < h; y++) b.set(px.subarray((h - 1 - y) * w, (h - y) * w), 54 + 1024 + y * rowSize);
  return b;
}
