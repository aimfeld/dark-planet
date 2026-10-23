"""The shop panel (sprite 501, SHOP.LIB) with English labels (Phase 5, docs/translation-notes.md §3).

The panel's labels are drawn in a 3 x 5 pixel font with 1 px between letters (I and the dot are 1 px wide, M and
W 5 px). Two styles: yellow (colour 97) on transparent around the jet diagram, and dark red (253) on the yellow
(97) button faces. The German labels are erased, and the English ones are written with letters harvested from the
panel itself, so the font stays the 1998 one. The panel has no X, so X is drawn here in the same style.

Erasing: a yellow label's pixels become transparent; a button label's pixels take the colour of the row above
the label in the same column (the faces and their borders are constant down each column; some German labels
reach into the 2 px border, e.g. AUSTAUSCH and WECHSEL).

Usage: uv run --with numpy --with pillow python tools/english_shop.py game/public/data preview.png
"""
import gzip
import json
import os
import sys

import numpy as np

PANEL = 501
YELLOW, DARK = 97, 253
FLOAT, BUTTON = 'float', 'button'
HEIGHT = 5
WIDTH = {'I': 1, '.': 1, 'M': 5, 'W': 5}  # every other letter is 3 px

# The German labels: text, left x, top y, style (positions measured on sprite 501).
GERMAN = [
    ('KUGEL', 57, 5, FLOAT),
    ('KL.POD', 78, 8, FLOAT),
    ('STANDADPOD', 119, 8, FLOAT),
    ('SHIELD', 10, 35, FLOAT),
    ('GR.PODS', 54, 35, FLOAT),
    ('GR.PODS', 137, 35, FLOAT),
    ('BONI', 41, 79, FLOAT),
    ('ANTRIEB', 96, 103, FLOAT),
    ('GELD', 151, 101, BUTTON),
    ('AUSTAUSCH', 142, 108, BUTTON),
    ('PLAYER', 43, 120, BUTTON),
    ('KAUFEN', 160, 134, BUTTON),
    ('VER', 206, 130, BUTTON),
    ('KAUFEN', 200, 137, BUTTON),
    ('POSITION', 238, 130, BUTTON),
    ('WECHSEL', 237, 137, BUTTON),
    ('HAUPT', 282, 130, BUTTON),
    ('MENU', 283, 137, BUTTON),
]

KEEP = {'SHIELD', 'PLAYER', 'MENU'}  # the same in English: left as they are

# The English labels: text, centre x, top y, style. Centred where the German label (or button face) was centred.
# KL.POD and GR.PODS become SMALL and LARGE: "SM.POD" (23 px, the M is 5 px wide) doesn't fit between the box
# below KUGEL (right edge x 77) and the small pod box (x 100), which leave 21 px.
ENGLISH = [
    ('BALL', 66, 5, FLOAT),  # KUGEL
    ('SMALL', 88, 8, FLOAT),  # KL.POD
    ('STD.POD', 138, 8, FLOAT),  # STANDADPOD
    ('LARGE', 66, 35, FLOAT),  # GR.PODS
    ('LARGE', 149, 35, FLOAT),
    ('BONUS', 47, 79, FLOAT),  # BONI
    ('ENGINE', 108, 103, FLOAT),  # ANTRIEB
    ('MONEY', 159, 101, BUTTON),  # GELD / AUSTAUSCH, face x 144-174
    ('EXCHANGE', 159, 108, BUTTON),
    ('BUY', 171, 134, BUTTON),  # KAUFEN, face x 159-183
    ('SELL', 211, 134, BUTTON),  # VER / KAUFEN in one line, at KAUFEN's height; face x 199-223
    ('CHANGE', 251, 130, BUTTON),  # POSITION / WECHSEL, face x 239-263
    ('POSITION', 251, 137, BUTTON),
    ('MAIN', 291, 130, BUTTON),  # HAUPT / MENU, face x 279-303
]

# Where the panel has a letter in more than one shape, the one used (label, index in that label's text).
# A: pointed, as in most labels (ANTRIEB's is square). N: KAUFEN's.
PREFERRED = {'A': ('KAUFEN', 1), 'N': ('KAUFEN', 5)}

# Letters the panel doesn't have, drawn in its style.
DRAWN = {
    'X': ['#.#',
          '#.#',
          '.#.',
          '#.#',
          '#.#'],
}


def width(c):
    return WIDTH.get(c, 3)


def text_width(text):
    return sum(width(c) for c in text) + len(text) - 1


def ink(style):
    return YELLOW if style == FLOAT else DARK


def letters(panel, text, x, y, style):
    """The label's letters as (x, 5 x w bool mask): the runs of inked columns, one per letter."""
    mask = panel[y:y + HEIGHT, x - 1:x + text_width(text) + 2] == ink(style)
    cols = np.flatnonzero(mask.any(0))
    runs = np.split(cols, np.flatnonzero(np.diff(cols) > 1) + 1)
    assert len(runs) == len(text), (text, len(runs))
    return [(x - 1 + r[0], mask[:, r[0]:r[-1] + 1]) for r in runs]


def harvest(panel):
    """Letter -> list of (label, index, 5 x w bool mask), from every German label."""
    glyphs = {}
    for text, x, y, style in GERMAN:
        for i, (c, (_, g)) in enumerate(zip(text, letters(panel, text, x, y, style))):
            glyphs.setdefault(c, []).append((text, i, g.copy()))
    return glyphs


def font(panel):
    """Letter -> 5 x w bool mask: the preferred shape, else the first; plus the drawn letters."""
    out = {}
    for c, variants in harvest(panel).items():
        chosen = [g for text, i, g in variants if PREFERRED.get(c) == (text, i)]
        out[c] = chosen[0] if chosen else variants[0][2]
    for c, rows in DRAWN.items():
        out[c] = np.array([[ch == '#' for ch in row] for row in rows])
    return out


def erase(panel, text, x, y, style):
    found = letters(panel, text, x, y, style)
    x0, x1 = found[0][0], found[-1][0] + found[-1][1].shape[1]
    box = panel[y:y + HEIGHT, x0:x1]
    hit = box == ink(style)
    if style == FLOAT:
        box[hit] = 0
    else:
        box[hit] = np.broadcast_to(panel[y - 1, x0:x1], box.shape)[hit]


def draw(panel, glyphs, text, cx, y, style):
    x = cx - (text_width(text) - 1) // 2
    for c in text:
        g = glyphs[c]
        panel[y:y + HEIGHT, x:x + g.shape[1]][g] = ink(style)
        x += g.shape[1] + 1


def shop_panel_en(panel):
    """Sprite 501 (palette indices, 0 = transparent) with the English labels."""
    glyphs = font(panel)
    out = panel.copy()
    for label in GERMAN:
        if label[0] not in KEEP:
            erase(out, *label)
    for label in ENGLISH:
        draw(out, glyphs, *label)
    return out


def load_sprite(data, n):
    meta = json.load(open(os.path.join(data, 'sprites.json')))
    raw = gzip.decompress(open(os.path.join(data, 'sprites.bin.gz'), 'rb').read())
    offset, w, h = meta[str(n)]
    return np.frombuffer(raw[offset:offset + w * h], np.uint8).reshape(h, w).copy()


def main(data, path):
    from PIL import Image
    de = load_sprite(data, PANEL)
    en = shop_panel_en(de)
    palette = np.array(json.load(open(os.path.join(data, 'palette.json')))['rgb'], np.uint8)
    rows = []
    for background in ((255, 0, 255), (128, 128, 128)):
        row = []
        for px in (de, en):
            img = palette[px]
            img[px == 0] = background
            row.append(img)
        rows.append(np.concatenate([row[0], np.zeros((px.shape[0], 8, 3), np.uint8), row[1]], 1))
    img = np.concatenate([rows[0], np.zeros((8, rows[0].shape[1], 3), np.uint8), rows[1]], 0)
    Image.fromarray(img).resize((img.shape[1] * 4, img.shape[0] * 4), Image.NEAREST).save(path)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
