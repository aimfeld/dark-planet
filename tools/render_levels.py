"""Render Dark Planet's levels (LEVEL1-6.LEV + TI1/TI2.LIB) as full PNGs, plus a JSON dump.

Writes into <output_dir>/levels/:
  levelN.png        320 x 6400, the whole level (start of the level at the bottom)
  levelN_spawns.png the same at 2x with the spawn records drawn on top: each enemy's sprite
                    where SpawnEnemy places it (bottom edge on the screen top at the moment
                    the record fires), a tick at (x, trigger y) labelled type.sub;
                    yellow = flag 1, cyan = flag 0, magenta = boss trigger (no sprite).
                    Empty slots (y = 100) are skipped.
  levels.json       per level: tileset, the 200 x 10 tile grid (bottom row first, as in
                    the file) and the 600 spawn records

Evidence (DP.EXE, see docs/re-notes.md "Levels"):
  StartLevel @0x1B582  loads tileset string DS:0xF38 + 0x100 * episode (Ti1.lib, Ti2.lib)
                       with AniVGA LoadTile, so levels 1-3 use TI1 and 4-6 use TI2
  LoadLevel @0x1B3ED   200 rows x 10 bytes into LevMap, then 4200 bytes (600 x 7) to DS:0x4442
  BuildLevel @0x1B4FF  tile row r (1-based) at level y = 168 - 32 * (r - 1), column c at x = 32 * (c - 1);
                       AniVGA's PutTile 28be:5083 snaps y to its 16 px grid (origin -6400), so the row
                       really lands at 160 - 32 * (r - 1) (confirmed against the DOSBox-X capture)
  SpawnFromLevel @0x16653  a record fires when its Y equals the scroll Y (DS:0x25B6, the
                       level y at the top of the screen; 0 at the start, decreasing)
  SpawnEnemy @0x1163A  sprite = word DS:0x19FA[type], SpriteY = Y - sprite height

Usage: uv run --with numpy --with pillow python tools/render_levels.py \
           original_source <output_dir>
"""
import json
import os
import struct
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
from anivga import read_palette, read_sprite_lib  # noqa: E402
from extract_sprites import SPRITE_LIBS, rgba  # noqa: E402

COLS, ROWS, TILE = 10, 200, 32
RECORDS, RECORD_SIZE = 600, 7
LEVEL_TOP = 160 - TILE * (ROWS - 1)  # level y of the image's top edge (-6208)
UNUSED_Y = 100  # never reached by the scroll (it starts at 0 and decreases): an empty slot
BOSS_TYPES = {0x05, 0x20, 0x23, 0x3C, 0x43, 0x48}  # SpawnFromLevel calls StartBossFight @0x1627E
MAX_TYPE = 0x4A  # SpawnFromLevel ignores larger types
# SpawnFromLevel adds these to the spawn Y for some types (0x2D also moves X by -50)
Y_OFFSET = {0x08: 20, 0x0F: 25, 0x14: 10, 0x2D: 130, 0x36: 30}
X_OFFSET = {0x2D: -50}
DS_FILE_OFFSET = 0x328D0 - 0x10000 + 8608  # DP.EXE data segment (linear 0x328D0) in the file
ENEMY_SPRITE_TABLE = 0x19FA  # DS: word per enemy type, the AniVGA sprite number


def enemy_sprites(game):
    """type -> Sprite (first frame), from DP.EXE's table and the decoded libraries."""
    exe = open(os.path.join(game, 'DP.EXE'), 'rb').read()
    numbers = struct.unpack_from(f'<{MAX_TYPE + 1}H', exe, DS_FILE_OFFSET + ENEMY_SPRITE_TABLE)
    by_number = {}
    for name, base in SPRITE_LIBS:
        for i, sprite in enumerate(read_sprite_lib(os.path.join(game, name))):
            by_number[base + i] = sprite
    return {t: by_number[n] for t, n in enumerate(numbers) if n in by_number}


def tileset_for(level):
    episode = (level - 1) // 3 + 1  # DS:0x15E7, set by the game menu
    return f'TI{episode}.LIB'


def read_level(path):
    data = open(path, 'rb').read()
    assert len(data) == COLS * ROWS + RECORDS * RECORD_SIZE, path
    grid = np.frombuffer(data, np.uint8, COLS * ROWS).reshape(ROWS, COLS)  # row 0 = level start
    records = [dict(zip(('y', 'x', 'type', 'sub', 'flag'),
                        struct.unpack_from('<hhBBB', data, COLS * ROWS + RECORD_SIZE * i)))
               for i in range(RECORDS)]
    return grid, records


def render(grid, tiles, palette):
    img = np.zeros((ROWS * TILE, COLS * TILE), np.uint8)
    for r in range(ROWS):
        y = (ROWS - 1 - r) * TILE
        for c in range(COLS):
            img[y:y + TILE, c * TILE:(c + 1) * TILE] = tiles[grid[r, c] - 1].pixels
    return palette[img]


def draw_spawns(rgb, records, sprites, palette, scale=2):
    im = Image.fromarray(rgb).resize((rgb.shape[1] * scale, rgb.shape[0] * scale), Image.NEAREST)
    for rec in records:
        t = rec['type']
        if t in BOSS_TYPES or t not in sprites:
            continue
        s = sprites[t]
        x = (rec['x'] + X_OFFSET.get(t, 0)) * scale
        y = (rec['y'] + Y_OFFSET.get(t, 0) - s.height - LEVEL_TOP) * scale
        img = Image.fromarray(rgba(s, palette)).resize((s.width * scale, s.height * scale), Image.NEAREST)
        im.paste(img, (x, y), img)
    draw = ImageDraw.Draw(im)
    for rec in records:
        y = (rec['y'] - LEVEL_TOP) * scale
        if not 0 <= y < im.height or rec['type'] > MAX_TYPE:
            continue
        x = rec['x'] * scale
        colour = (255, 64, 255) if rec['type'] in BOSS_TYPES else \
            (255, 255, 0) if rec['flag'] else (0, 255, 255)
        draw.line((x - 6, y, x + 6, y), fill=colour, width=2)
        draw.text((x + 8, y - 6), f"{rec['type']}.{rec['sub']}", fill=colour)
    return im


def main(src, out):
    game = os.path.join(src, 'Game')
    out_dir = os.path.join(out, 'levels')
    os.makedirs(out_dir, exist_ok=True)
    palette = read_palette(os.path.join(game, 'EPIS1.PAL'))
    sprites = enemy_sprites(game)
    dump = {}
    for level in range(1, 7):
        tileset = tileset_for(level)
        tiles = read_sprite_lib(os.path.join(game, tileset))
        assert all((t.width, t.height) == (TILE, TILE) for t in tiles)
        grid, records = read_level(os.path.join(game, f'LEVEL{level}.LEV'))
        assert 1 <= grid.min() and grid.max() <= len(tiles)
        rgb = render(grid, tiles, palette)
        Image.fromarray(rgb).save(os.path.join(out_dir, f'level{level}.png'))
        draw_spawns(rgb, [r for r in records if r['y'] != UNUSED_Y], sprites, palette).save(
            os.path.join(out_dir, f'level{level}_spawns.png'))
        dump[f'LEVEL{level}.LEV'] = {'tileset': tileset, 'tiles': grid.tolist(), 'records': records}
    with open(os.path.join(out_dir, 'levels.json'), 'w') as f:
        json.dump(dump, f)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
