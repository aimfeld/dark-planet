// Game data exported from the original files by tools/export_engine_data.py (game/public/data/).

import type { Lang } from './i18n';

export interface Volley {
  dx: number;
  dy: number;
  pattern: number;
  type: number;
}

export interface Jet {
  id: number;
  name: string;
  price: number;
  shop_sprite: number;
  max_life: number;
  ram_damage: number;
  frame_base: number;
  extents: { l: number; r: number; t: number; b: number };
  mounts: boolean[];
  standard_weapon: { sprite: number; sound: number; reload: number; volley: Volley[] };
}

export interface Pod {
  id: number;
  name: string;
  price: number;
  sound: number;
  reload: number;
  volley: Volley[];
  sprite?: number;
  shop_sprite?: number; // small pods (large and ball pods show their game sprite)
  fire_anim?: number | null;
  contact_damage?: number;
  orbit_factor?: number;
}

export interface Gun {
  gun: number;
  kind: number;
  flugart: number; // flight pattern of the enemy shot
  dx: number;
  dy: number;
  inter: number;
  salvo_pause: number;
  salvo: number;
}

export interface EnemyType {
  type: number;
  sprite: number;
  layer: number;
  energy: number;
  reward: number;
  ram_damage: number;
  wreck: number;
  shadow: [number, number];
  gun_class: number;
  fire_delay: number | null;
  scripted_only: boolean | null;
  guns: Gun[];
  boss: boolean;
  explosion_kind: { kind: number; dx: number; dy: number; rnd: number } | null;
  kill_sound: number | null;
}

export interface ExplosionPart {
  anim: number;
  delay: number;
  dx: number;
  dy: number;
  rx?: number;
  ry?: number;
  screen?: boolean;
  delay_rand?: number;
  delay_step?: number;
}

export interface Tables {
  jets: Jet[];
  engines: { id: number; name: string; price: number; shop_sprite: number; max_speed: number }[];
  shields: { id: number; name: string; price: number; shop_sprite: number; max: number; recharge_every: number }[];
  small_pods: Pod[];
  large_pods: Pod[];
  ball_pods: Pod[];
  mount_offsets: { mount: number; x_from: 'cx' | 'l' | 'r'; dx: number; dy: number }[];
  no_engine_max_speed: number;
  boni: { kind: number; name: string; price: number; sprite: number; hud_offset: number; inventory: boolean; pickup_sound: number }[];
  bonus_drop: { chance_below: number; thresholds: number[] };
  shot_types: { type: number; sprite: number; speed: number; damage: number }[];
  enemy_types: EnemyType[];
  enemy_shot_kinds: { kind: number; sprite: number; damage: number; sound: number; speed: number }[];
  explosion_anims: { anim: number; first: number; last: number; rate: number; sound: number }[];
  explosion_kinds: Record<string, ExplosionPart[]>;
  quake_ticks: Record<string, number>;
  sprite_anims: { anim: number; first: number; last: number; ping_pong: boolean; rest: number; rate: number; reverse: boolean }[];
  sprite_cycles: Record<'global' | 'episode1' | 'episode2', { first: number; last: number; rate: number }[]>;
  levels: {
    level: number;
    episode: number;
    cd_track: number;
    boss_trigger_y: number;
    boss_core: number;
    boss: { sounds: number[]; loop_sound: number | null; spawns: { x: number; dy: number; type: number; sub: number }[] };
  }[];
  sounds: string[];
}

export interface SpawnRecord {
  y: number;
  x: number;
  type: number;
  sub: number;
  flag: number;
}

export interface Level {
  tiles: number[][]; // 200 rows x 10 columns, row 0 = level start (bottom)
  records: SpawnRecord[];
}

/** One AniVGA sprite: palette indices (0 = transparent) and the boundary tables HitDetect uses. */
export class Sprite {
  readonly left: Int16Array; // per row: first opaque x, or 16000 when the row is empty
  readonly right: Int16Array; // per row: last opaque x, or -16000
  readonly top: Int16Array; // per column: first opaque y, or 16000
  readonly bottom: Int16Array; // per column: last opaque y, or -16000

  constructor(readonly w: number, readonly h: number, readonly px: Uint8Array) {
    this.left = new Int16Array(h).fill(16000);
    this.right = new Int16Array(h).fill(-16000);
    this.top = new Int16Array(w).fill(16000);
    this.bottom = new Int16Array(w).fill(-16000);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (px[y * w + x] === 0) continue;
        if (this.left[y] === 16000) this.left[y] = x;
        this.right[y] = x;
        if (this.top[x] === 16000) this.top[x] = y;
        this.bottom[x] = y;
      }
    }
  }
}

export interface Font {
  width: number;
  height: number;
  widths: number[];
  multicolor: boolean;
  glyphs: Uint8Array; // 256 x height x width: palette indices (multicolour) or 1 = set pixel (mono)
}

export interface GameData {
  tables: Tables;
  sprites: Map<number, Sprite>; // in the current sprite language (useSpriteLanguage)
  spriteLanguage: Lang;
  spriteVariants: Record<Lang, Map<number, Sprite>>; // the sprites with text in them, per language
  tiles: Uint8Array[]; // per episode: 32 x 32 tiles, 1024 bytes each
  levels: Level[];
  fonts: Record<string, Font>;
  palette: { rgb: number[][]; shadow: number[]; menus: Record<MenuPalette, number[][]> };
  pictures: Record<Picture, Uint8Array>; // 320 x 200 palette indices
  texts: Record<string, string[]>; // the game's text files by file name, as lines
}

/** Full-screen PIC backgrounds, in the order tools/export_engine_data.py writes them. */
export const PICTURES = ['HMBILD', 'UMBILD', 'OMBILD', 'RASTER'] as const;
export type Picture = (typeof PICTURES)[number];
export type MenuPalette = 'HMBILD' | 'UMBILD';

export interface RawData {
  json: (name: string) => Promise<unknown>;
  binary: (name: string) => Promise<ArrayBuffer>;
}

/**
 * The exported binaries are gzip files (*.bin.gz). Some web servers send .gz files with Content-Encoding: gzip,
 * so fetch() has already unpacked them; only data that still starts with the gzip magic is unpacked here.
 */
export async function gunzip(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const b = new Uint8Array(buf);
  if (b[0] !== 0x1f || b[1] !== 0x8b) return buf;
  return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}

export async function loadGameData(raw: RawData): Promise<GameData> {
  const [tables, spriteIndex, spriteBin, englishIndex, englishBin, tiles1, tiles2, levels, fontIndex, fontBin, palette, pictureBin, texts] = await Promise.all([
    raw.json('tables.json'),
    raw.json('sprites.json'),
    raw.binary('sprites.bin.gz').then(gunzip),
    raw.json('sprites-en.json'),
    raw.binary('sprites-en.bin.gz').then(gunzip),
    raw.binary('tiles1.bin.gz').then(gunzip),
    raw.binary('tiles2.bin.gz').then(gunzip),
    raw.json('levels.json'),
    raw.json('fonts.json'),
    raw.binary('fonts.bin.gz').then(gunzip),
    raw.json('palette.json'),
    raw.binary('pictures.bin.gz').then(gunzip),
    raw.json('texts.json'),
  ]);
  const readSprites = (index: unknown, bin: ArrayBuffer) => {
    const out = new Map<number, Sprite>();
    for (const [n, [offset, w, h]] of Object.entries(index as Record<string, [number, number, number]>)) {
      out.set(Number(n), new Sprite(w, h, new Uint8Array(bin, offset, w * h)));
    }
    return out;
  };
  const sprites = readSprites(spriteIndex, spriteBin);
  const en = readSprites(englishIndex, englishBin);
  const de = new Map([...en.keys()].map((n) => [n, sprites.get(n)!]));
  const fonts: Record<string, Font> = {};
  for (const [name, f] of Object.entries(fontIndex as Record<string, { width: number; height: number; offset: number; widths: number[]; multicolor: boolean }>)) {
    fonts[name] = { width: f.width, height: f.height, widths: f.widths, multicolor: f.multicolor, glyphs: new Uint8Array(fontBin, f.offset, 256 * f.width * f.height) };
  }
  return {
    tables: tables as Tables,
    sprites,
    spriteLanguage: 'de',
    spriteVariants: { de, en },
    tiles: [new Uint8Array(tiles1), new Uint8Array(tiles2)],
    levels: levels as Level[],
    fonts,
    palette: palette as GameData['palette'],
    pictures: Object.fromEntries(PICTURES.map((name, i) => [name, new Uint8Array(pictureBin, i * 64000, 64000)])) as GameData['pictures'],
    texts: texts as GameData['texts'],
  };
}

/**
 * Show the sprites with text in them in `lang` (Phase 5): the main menu items and the shop panel
 * (tools/export_english_sprites.py). German shows the originals.
 */
export function useSpriteLanguage(data: GameData, lang: Lang): void {
  if (data.spriteLanguage === lang) return;
  data.spriteLanguage = lang;
  for (const [n, s] of data.spriteVariants[lang]) data.sprites.set(n, s);
}
