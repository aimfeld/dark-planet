"""Decode Dark Planet's AniVGA fonts (.FNT) into PNGs.

Writes into <output_dir>/fonts/:
  <FONT>.png         16 x 16 grid of all 256 cells (CP437 order), RGBA, original pixels.
                     Monochrome fonts are white on transparent (the game picks the colour).
  <FONT>_sample.png  a German sample line at 3x, drawn with the per-character widths
  fonts.json         cell size, type and per-character advance widths

Usage: uv run --with numpy --with pillow python tools/extract_fonts.py \
           original_source <output_dir>
"""
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from anivga import read_font, read_palette  # noqa: E402

FONTS = ['DEFAULT.FNT', 'SUPER.FNT', '_BROADWA.FNT', 'FIRE.FNT']
PALETTE = 'EPIS1.PAL'
SAMPLE = 'DARK PLANET - Spiel starten! Größe: 0123456789 ÄÖÜäöü'


def glyph_rgba(font, code, palette):
    g = font.glyphs[code]
    out = np.zeros(g.shape + (4,), np.uint8)
    out[..., :3] = palette[g] if font.multicolor else 255
    out[..., 3] = np.where(g != 0, 255, 0)
    return out


def main(src, out):
    game = os.path.join(src, 'Game')
    out_dir = os.path.join(out, 'fonts')
    os.makedirs(out_dir, exist_ok=True)
    palette = read_palette(os.path.join(game, PALETTE))
    index = {}
    for name in FONTS:
        font = read_font(os.path.join(game, name))
        grid = np.zeros((16 * font.height, 16 * font.width, 4), np.uint8)
        for code in range(256):
            y, x = divmod(code, 16)
            grid[y * font.height:(y + 1) * font.height,
                 x * font.width:(x + 1) * font.width] = glyph_rgba(font, code, palette)
        stem = name[:-4]
        Image.fromarray(grid).save(os.path.join(out_dir, stem + '.png'))

        codes = SAMPLE.encode('cp437')
        sample = np.zeros((font.height + 4, sum(font.widths[c] for c in codes) + 4, 4), np.uint8)
        sample[..., :3] = (40, 40, 48)
        sample[..., 3] = 255
        x = 2
        for c in codes:
            g = glyph_rgba(font, c, palette)[:, :font.widths[c]]
            region = sample[2:2 + font.height, x:x + g.shape[1]]
            region[g[..., 3] > 0] = g[g[..., 3] > 0]
            x += font.widths[c]
        Image.fromarray(sample).resize((sample.shape[1] * 3, sample.shape[0] * 3),
                                       Image.NEAREST).save(os.path.join(out_dir, stem + '_sample.png'))
        index[name] = {'png': stem + '.png', 'cell_width': font.width, 'cell_height': font.height,
                       'multicolor': font.multicolor, 'widths': font.widths}
    with open(os.path.join(out_dir, 'fonts.json'), 'w') as f:
        json.dump(index, f, indent=1)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
