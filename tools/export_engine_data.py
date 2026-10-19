"""Write the data the TypeScript engine loads (game/public/data/, local only like original_source/).

Files (all indexed colour; the engine applies the palette itself):
  palette.json   EPIS1.PAL as 8-bit RGB, plus the AniVGA shadow table (SetShadowTab(70), see below)
  sprites.bin    every game sprite's pixels (palette indices, 0 = transparent), row-major, concatenated
  sprites.json   sprite number -> [byte offset, width, height] (numbers as DP.EXE loads them)
  tiles1.bin     TI1.LIB / TI2.LIB: 32 x 32 tiles, 1024 bytes each, in file order (tile t at (t - 1) * 1024)
  tiles2.bin
  fonts.bin      FIRE.FNT glyphs: 256 x height x width palette indices
  fonts.json     per font: cell size, byte offset, advance widths
  levels.json    LEVEL1-6: tile grid (row 0 = level start) and the 600 spawn records
  tables.json    tools/game_tables.py output
  sounds.bin     the SFX as SMIX stores them: signed 8-bit mono PCM at 11025 Hz, concatenated
  sounds.json    {rate, sounds: [{name, offset, length}]} in the game's load order, so index = PlaySound number

Usage: uv run --with numpy --with pillow python tools/export_engine_data.py original_source game/public/data
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import enemy_table  # noqa: E402
import game_tables  # noqa: E402
from anivga import read_font, read_sprite_lib  # noqa: E402
from extract_assets import SFX_RATE, read_smix  # noqa: E402
from extract_sprites import SPRITE_LIBS  # noqa: E402
from render_levels import read_level  # noqa: E402

FONTS = ['FIRE.FNT']  # money and lives in the HUD (text sprites, LevelStartSprites @0x107F8)


def shadow_table(pal6, brightness):
    """AniVGA SetShadowTab(brightness) @28be:0106 (DP.EXE calls it with 70).

    For colour c the target is each 6-bit channel * brightness div 100. The result is the first colour
    with no channel above the target and the smallest squared distance to it; if no colour qualifies,
    the first colour with the smallest squared distance."""
    pal = pal6.astype(int)
    out = []
    for r, g, b in pal:
        t = np.array([r * brightness // 100, g * brightness // 100, b * brightness // 100])
        d = ((pal - t) ** 2).sum(axis=1)
        below = (pal <= t).all(axis=1)
        out.append(int(np.argmin(np.where(below, d, 1 << 30))) if below.any() else int(np.argmin(d)))
    return out


def main(src, out):
    game = os.path.join(src, 'Game')
    os.makedirs(out, exist_ok=True)

    pal6 = np.frombuffer(open(os.path.join(game, 'EPIS1.PAL'), 'rb').read(), np.uint8).reshape(256, 3)
    rgb = (pal6.astype(int) * 255 // 63).tolist()
    with open(os.path.join(out, 'palette.json'), 'w') as f:
        json.dump({'rgb': rgb, 'shadow': shadow_table(pal6, 70)}, f)

    index, blobs, offset = {}, [], 0
    for name, base in SPRITE_LIBS:
        for i, s in enumerate(read_sprite_lib(os.path.join(game, name))):
            data = s.pixels.tobytes()
            index[base + i] = [offset, s.width, s.height]
            blobs.append(data)
            offset += len(data)
    open(os.path.join(out, 'sprites.bin'), 'wb').write(b''.join(blobs))
    with open(os.path.join(out, 'sprites.json'), 'w') as f:
        json.dump({str(k): v for k, v in sorted(index.items())}, f)

    for n in (1, 2):
        tiles = read_sprite_lib(os.path.join(game, 'TI%d.LIB' % n))
        assert all((t.width, t.height) == (32, 32) for t in tiles)
        open(os.path.join(out, 'tiles%d.bin' % n), 'wb').write(b''.join(t.pixels.tobytes() for t in tiles))

    fonts, blobs, offset = {}, [], 0
    for name in FONTS:
        font = read_font(os.path.join(game, name))
        assert font.multicolor
        data = font.glyphs.astype(np.uint8).tobytes()
        fonts[name[:-4]] = {'width': font.width, 'height': font.height, 'offset': offset, 'widths': font.widths}
        blobs.append(data)
        offset += len(data)
    open(os.path.join(out, 'fonts.bin'), 'wb').write(b''.join(blobs))
    with open(os.path.join(out, 'fonts.json'), 'w') as f:
        json.dump(fonts, f)

    levels = []
    for n in range(1, 7):
        grid, records = read_level(os.path.join(game, 'LEVEL%d.LEV' % n))
        levels.append({'tiles': grid.tolist(), 'records': records})
    with open(os.path.join(out, 'levels.json'), 'w') as f:
        json.dump(levels, f)

    enemy_table.load(src)
    tables = game_tables.tables()
    with open(os.path.join(out, 'tables.json'), 'w') as f:
        json.dump(tables, f)

    # PlaySound(n) indexes the SMIX load list (names in DP.EXE, game_tables.SOUNDS); look each name up
    pcm = {}
    for snd in ('AREA.SND', 'AREA2.SND'):
        for _, name, data in read_smix(os.path.join(game, snd)):
            pcm.setdefault(name.upper(), data)
    sounds, blobs, offset = [], [], 0
    for name in tables['sounds']:
        data = pcm[name.upper()]
        sounds.append({'name': name, 'offset': offset, 'length': len(data)})
        blobs.append(data)
        offset += len(data)
    open(os.path.join(out, 'sounds.bin'), 'wb').write(b''.join(blobs))
    with open(os.path.join(out, 'sounds.json'), 'w') as f:
        json.dump({'rate': SFX_RATE, 'sounds': sounds}, f)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
