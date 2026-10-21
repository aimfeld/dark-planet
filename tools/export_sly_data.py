"""Write the data of the 1997 prototype SLYVERS (original_source/CD/Wasndas/SLY/) for the TypeScript port.

The prototype loads its files by name (SLYVERS.PAS InitSprites, LoadTile, LoadFont, FXInit), so the export keeps
them by file name and the port assigns the load numbers as the Pascal code does. Output (game/public/sly/):
  sly.json        palette (RAUM.PAL as 8-bit RGB) and AniVGA's shadow table for SetShadowTab(50);
                  files: per sprite file, its sprites as [byte offset, width, height] into graphics.bin.gz;
                  font: FIRE.FNT (cell size, byte offset, advance widths); level: LEVEL2.LEV's tile grid
  graphics.bin.gz sprite and tile pixels (palette indices, 0 = transparent, row-major), then the font glyphs
  sounds.json     {rate, sounds: [{name, offset, length}]} in FXInit's order, so index = Sounds[] number
  sounds.bin.gz   RAUM28.SND's samples as SMIX stores them (signed 8-bit mono)

Usage: uv run --with numpy --with pillow python tools/export_sly_data.py original_source game/public/sly
"""
import json
import os
import struct
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from anivga import read_font, read_sprite_lib  # noqa: E402
from export_engine_data import read_pal, shadow_table, write_bin  # noqa: E402
from extract_assets import SFX_RATE, read_smix  # noqa: E402

SLY = os.path.join('CD', 'Wasndas', 'SLY')
# Every sprite file SLYVERS.EXE loads (InitSprites, the tiles); GEG1A.COD, EXPL1-4A.LIB, S12.COD lie unused beside them.
# ICON3.COD is loaded too (LoadSprite('Icon3.cod', 1)) but is not on the CD; JETB2.COD replaces it at load number 1.
SPRITE_FILES = ['JETB2.COD', 'JETB3.COD', 'MIS1A.COD', 'MIS1B.COD', 'S10.COD', 'S11.COD', 'UFO!.COD', 'SLY_16E.COD',
                'EXPL1-7B.LIB', 'EX2A-F.LIB', 'ICON5!.COD', 'UFO.LIB', 'LASER2.COD', 'BACK1-14.LIB']
# FXInit: LoadSound(Sounds[i], name) in this order
SOUNDS = ['ALARM', 'AIREXPLO', 'ALARM01', 'BOOT', 'BUGGY', 'DROHNE1', 'ENEMYHIT', 'ENERGY', 'FEUER', 'FIRE001',
          'GLEITER', 'GLOCKE', 'GRNDHIT', 'GRNEXPLO', 'HELIIN', 'LKW', 'LAVA006A', 'MAGMAA', 'MOTHER', 'ROTOR04',
          'ROCKET', 'SCHWEB', 'SMLEXPLO', 'SOUND3', 'SOUND20', 'SOUND4', 'SOUND6', 'TANK_A', 'SOUND9', 'TANK',
          'SOUND8', 'TANK_I', 'TANK1', 'WPSHOOT2', 'MOOMOO', 'MERVEUX', 'TOETEN', 'KUCHEN', 'LACHEN2', 'KUCKMAL']
SHADOW_BRIGHTNESS = 50  # CONST brightness = 50, SetShadowTab(brightness)


def read_level(path):
    """LevelLaden: u16 width (tiles), u16 height, then height rows of width bytes (row 1 = the level's bottom).

    LEVEL2.LEV has 1000 six-byte spawn records (y, x, type, sub as in Dark Planet's LEV) after the grid; the
    prototype doesn't read them (its enemies come from the Aktivierung* constants)."""
    data = open(path, 'rb').read()
    width, height = struct.unpack_from('<2H', data)
    assert len(data) in (4 + width * height, 4 + width * height + 1000 * 6), path
    return [list(data[4 + r * width:4 + (r + 1) * width]) for r in range(height)]


def main(src, out):
    sly = os.path.join(src, SLY)
    os.makedirs(out, exist_ok=True)
    blobs, offset, files = [], 0, {}
    for name in SPRITE_FILES:
        entries = []
        for s in read_sprite_lib(os.path.join(sly, name)):
            data = s.pixels.tobytes()
            entries.append([offset, s.width, s.height])
            blobs.append(data)
            offset += len(data)
        files[name] = entries
    font = read_font(os.path.join(sly, 'FIRE.FNT'))
    assert font.multicolor
    font_info = {'width': font.width, 'height': font.height, 'offset': offset, 'widths': font.widths}
    blobs.append(font.glyphs.astype(np.uint8).tobytes())
    write_bin(out, 'graphics.bin', b''.join(blobs))

    pal6 = read_pal(os.path.join(sly, 'RAUM.PAL'))
    index = {
        'palette': {'rgb': (pal6.astype(int) * 255 // 63).tolist(), 'shadow': shadow_table(pal6, SHADOW_BRIGHTNESS)},
        'files': files,
        'font': font_info,
        'level': read_level(os.path.join(sly, 'LEVEL2.LEV')),
    }
    with open(os.path.join(out, 'sly.json'), 'w') as f:
        json.dump(index, f)

    pcm = {name.upper(): data for _, name, data in read_smix(os.path.join(sly, 'RAUM28.SND'))}
    sounds, blobs, offset = [], [], 0
    for name in SOUNDS:
        data = pcm[name]
        sounds.append({'name': name, 'offset': offset, 'length': len(data)})
        blobs.append(data)
        offset += len(data)
    write_bin(out, 'sounds.bin', b''.join(blobs))
    with open(os.path.join(out, 'sounds.json'), 'w') as f:
        json.dump({'rate': SFX_RATE, 'sounds': sounds}, f)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
