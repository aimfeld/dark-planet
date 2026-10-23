"""Write the English main menu items and shop panel (Phase 5, docs/translation-notes.md "English sprites").

  sprites-en.json     sprite number -> [byte offset, width, height], like sprites.json
  sprites-en.bin.gz   their pixels (palette indices, 0 = transparent), row-major, concatenated

The game shows them instead of the originals while the language is English (data.ts useSpriteLanguage):
  613-678  the six main menu items (New Game, Load Game, The Story, Manual, Horse Productions, Exit), 11 frames
           each (tools/menu_items.py)
  501      the shop panel with English labels (tools/english_shop.py)

The output is under version control: the menu items are rendered with system fonts (fc-match), so another machine
could give slightly different pixels.

Usage: uv run --with numpy --with pillow python tools/export_english_sprites.py game/public/data
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from english_shop import PANEL, load_sprite, shop_panel_en  # noqa: E402
from export_engine_data import write_bin  # noqa: E402
from menu_items import english_items  # noqa: E402


def main(data):
    sprites = {PANEL: shop_panel_en(load_sprite(data, PANEL)), **english_items(data)}
    index, blob = {}, bytearray()
    for n in sorted(sprites):
        px = sprites[n]
        index[n] = [len(blob), px.shape[1], px.shape[0]]
        blob += px.astype('uint8').tobytes()
    write_bin(data, 'sprites-en.bin', bytes(blob))
    with open(os.path.join(data, 'sprites-en.json'), 'w') as f:
        json.dump(index, f)
    print(len(sprites), 'English sprites')


if __name__ == '__main__':
    main(sys.argv[1])
