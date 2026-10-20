"""Write the app icons (PWA manifest, home screen, favicon): game/public/icons/.

A square crop of the title picture (HMBILD.PIC with HMBILD.PAL: both jets and the fire), scaled smoothly.
The crop is full-bleed, so the same picture also serves as the maskable icon (Android cuts it to a circle or
rounded square; the jets stay inside the safe zone).
  icon-192.png, icon-512.png  manifest icons (purpose "any maskable")
  apple-touch-icon.png        180 x 180, iOS "Zum Home-Bildschirm"
  favicon-32.png              browser tab

Usage: uv run --with numpy --with pillow python tools/export_icons.py original_source game/public/icons
"""
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from export_engine_data import read_pal, read_pic  # noqa: E402

CROP = (40, 20, 180)  # x, y, size in the 320 x 200 picture
SIZES = {'icon-192.png': 192, 'icon-512.png': 512, 'apple-touch-icon.png': 180, 'favicon-32.png': 32}


def main(src, out):
    os.makedirs(out, exist_ok=True)
    game = os.path.join(src, 'Game')
    indices = read_pic(os.path.join(game, 'HMBILD.PIC'))
    rgb = (read_pal(os.path.join(game, 'HMBILD.PAL')).astype(int) * 255 // 63).astype('uint8')  # as palette.json
    x, y, s = CROP
    square = Image.fromarray(rgb[indices]).crop((x, y, x + s, y + s))
    for name, size in SIZES.items():
        path = os.path.join(out, name)
        square.resize((size, size), Image.LANCZOS).save(path, optimize=True)
        print('%s: %d KB' % (path, os.path.getsize(path) // 1024))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
