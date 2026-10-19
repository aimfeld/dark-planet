"""Decode Dark Planet's AniVGA sprite libraries into PNG sheets plus a JSON index.

Writes into <output_dir>/sprites/:
  <LIB>.png          RGBA sprite sheet (colour 0 transparent), original pixels
  <LIB>_preview.png  the same sheet at 2x on dark grey, labelled with sprite numbers
  sprites.json       sprite number -> sheet, rectangle, size, opaque bounding box

Sprite numbers are the AniVGA load numbers DP.EXE assigns: each library is
loaded by LoadLib @0x137A0 from a fixed base number (calls at 0x13B84..0x13C33),
and sprite i of the file gets base + i. AniVGA 1.2 sprites have no hotspot; the
game positions them by their top-left corner.

Usage: uv run --with numpy --with pillow python tools/extract_sprites.py \
           original_source <output_dir>
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
from anivga import read_palette, read_sprite_lib  # noqa: E402

# (file, base sprite number), in DP.EXE load order
SPRITE_LIBS = [('JETS.LIB', 1), ('PODS.LIB', 43), ('SHOTS.LIB', 146), ('EXPL.LIB', 293),
               ('BONI.LIB', 393), ('ANZEIGEN.LIB', 490), ('SHOP.LIB', 493), ('REST.LIB', 544),
               ('GEG1.LIB', 850), ('ASCHEN1.LIB', 1000), ('GEG2.LIB', 1024),
               ('GEG21.LIB', 1165), ('GEG22.LIB', 1243), ('ASCHEN2.LIB', 1355)]
PALETTE = 'EPIS1.PAL'  # the in-game palette (the game loads only this one for play)
SHEET_WIDTH = 1024
PAD = 1


def pack(sprites, sheet_width):
    """Shelf packing in file order (keeps animation frames next to each other)."""
    x = y = shelf = 0
    rects = []
    for s in sprites:
        if x + s.width > sheet_width:
            x, y, shelf = 0, y + shelf + PAD, 0
        rects.append((x, y))
        x += s.width + PAD
        shelf = max(shelf, s.height)
    return rects, y + shelf


def rgba(sprite, palette):
    out = np.zeros((sprite.height, sprite.width, 4), np.uint8)
    out[..., :3] = palette[sprite.pixels]
    out[..., 3] = np.where(sprite.pixels != 0, 255, 0)
    return out


def bbox(sprite):
    ys, xs = np.nonzero(sprite.pixels)
    if not len(xs):
        return None
    return [int(xs.min()), int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)]


def write_sheet(name, base, sprites, palette, out_dir, index):
    width = min(SHEET_WIDTH, max(sum(s.width + PAD for s in sprites), 1))
    width = max(width, max(s.width for s in sprites))
    rects, height = pack(sprites, width)
    sheet = np.zeros((height, width, 4), np.uint8)
    for s, (x, y) in zip(sprites, rects):
        sheet[y:y + s.height, x:x + s.width] = rgba(s, palette)
    stem = name[:-4]
    Image.fromarray(sheet).save(os.path.join(out_dir, stem + '.png'))

    # Labelled preview for eyeballing: 2x, dark background, numbers above each sprite.
    label_h = 10
    rects2, height2 = pack_labelled(sprites, width, label_h)
    preview = Image.new('RGB', (width * 2, height2 * 2), (40, 40, 48))
    draw = ImageDraw.Draw(preview)
    for i, (s, (x, y)) in enumerate(zip(sprites, rects2)):
        img = Image.fromarray(rgba(s, palette)).resize((s.width * 2, s.height * 2), Image.NEAREST)
        preview.paste(img, (x * 2, (y + label_h) * 2), img)
        draw.text((x * 2, y * 2), str(base + i), fill=(255, 255, 0))
    preview.save(os.path.join(out_dir, stem + '_preview.png'))

    for i, (s, (x, y)) in enumerate(zip(sprites, rects)):
        index[base + i] = {'lib': name, 'index': i, 'sheet': stem + '.png',
                           'x': x, 'y': y, 'width': s.width, 'height': s.height,
                           'bbox': bbox(s)}


def pack_labelled(sprites, sheet_width, label_h):
    x = y = shelf = 0
    rects = []
    for s in sprites:
        w = max(s.width, 24)  # room for a 4-digit label at 2x
        if x + w > sheet_width:
            x, y, shelf = 0, y + shelf + label_h + 4, 0
        rects.append((x, y))
        x += w + 4
        shelf = max(shelf, s.height)
    return rects, y + shelf + label_h + 4


def main(src, out):
    game = os.path.join(src, 'Game')
    out_dir = os.path.join(out, 'sprites')
    os.makedirs(out_dir, exist_ok=True)
    palette = read_palette(os.path.join(game, PALETTE))
    index = {}
    for name, base in SPRITE_LIBS:
        write_sheet(name, base, read_sprite_lib(os.path.join(game, name)), palette, out_dir, index)
    with open(os.path.join(out_dir, 'sprites.json'), 'w') as f:
        json.dump({'palette': PALETTE, 'transparent_index': 0,
                   'sprites': {str(k): v for k, v in sorted(index.items())}}, f, indent=1)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
