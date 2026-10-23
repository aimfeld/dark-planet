"""Render the main menu items (REST.LIB sprites 613-678) as 3D extruded text, in the style of the 1998 originals.

Each item is 11 frames: the base frame (flat, unanimated) and 10 glow frames that the menu cycles while the item is
selected (re-notes "Main menu"). The originals were rendered in 3D Studio Max (the user, session 25): blue text
faces, grey metal sides, in perspective. Here one camera sees the whole menu, its horizon at the bottom of item 3
(VP), so the items above it show their bottom sides and those below their top sides. The glow frames are a vertical wave running up through the text
(Max's Wave modifier): the face bulges and tilts, so its height, the visible sides and the highlights change from
frame to frame. A dark, anti-aliased outline surrounds each item (rendered on black), and a dark line runs where the faces
meet the sides.

The renderer extrudes a TrueType glyph mask, deforms it, splats it point by point into a supersampled z-buffer,
shades it, downsamples it and maps it to the HMBILD palette entries the originals use. It matches the originals'
style, not their pixels (docs/translation-notes.md "English sprites"); tools/export_english_sprites.py writes the
English items (all six, in one font) into the game data.

Usage: uv run --with numpy --with pillow python tools/menu_items.py compare game/public/data <out.png> [items]
       uv run --with numpy --with pillow python tools/menu_items.py preview game/public/data <out.gif> [en]
       uv run --with numpy --with pillow python tools/menu_items.py hires game/public/data <out.png> de|en
"""
import gzip
import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

FIRST = 613  # sprite of item 1's base frame; item i, frame k = FIRST + 11 (i - 1) + k
FRAMES = 11
SS = 4  # screen supersampling per output pixel (classic)
HIRES = 4  # the remastered renders: output px per menu px (hiResView's S)
HIRES_SS = 2  # their supersampling per output pixel
HIRES_OUTLINE = 0.8  # their dark outline's width, menu px
CHUNK = 1 << 20  # points per batch (memory)
EDGE = 0.7  # depth of the dark line along the sides' front edge (where face and side meet), output px
OUTLINE_COVER = 0.05  # coverage from which a pixel next to the silhouette becomes part of the black outline
VP = (160.0, 98.0)  # vanishing point: the horizon is at the bottom of item 3, Die Geschichte (the user, session 25)
LIGHT = np.array([-0.35, -0.6, -0.72])  # towards the light: upper left, in front
LIGHT /= np.linalg.norm(LIGHT)
FACE_DARK, FACE_LIGHT = np.array([16, 60, 100.]), np.array([121, 198, 255.])
SIDE_DARK, SIDE_LIGHT = np.array([20, 24, 24.]), np.array([200, 205, 205.])
WAVE_AMP = 3.6  # the Wave modifier's amplitude (px of depth)
WAVE_LEN = 21.0  # its wave length (px of height)


def font_path(name):
    return subprocess.run(['fc-match', '-f', '%{file}', name], capture_output=True, text=True, check=True).stdout


def glyph_mask(text, font, size, scale, bold):
    """The text's mask at `scale` model px per output px; model y points down. `bold`: extra stroke width per side
    (output px), a synthetic bold."""
    f = ImageFont.truetype(font_path(font), round(size * scale))
    left, top, right, bottom = f.getbbox(text)
    pad = 2
    stroke = round(bold * scale)
    img = Image.new('L', (right - left + 2 * (pad + stroke), bottom - top + 2 * (pad + stroke)))
    ImageDraw.Draw(img).text((pad + stroke - left, pad + stroke - top), text, font=f, fill=255,
                             stroke_width=stroke, stroke_fill=255)
    return np.array(img) > 127


def surface_points(mask, scale, depth):
    """Front face and side wall sample points: (u, v, w) in output px, and the side walls' outward 2D normals."""
    h, w = mask.shape
    vs, us = np.nonzero(mask)
    front = np.stack([us, vs, np.zeros_like(us)], 1).astype(float) / [scale, scale, 1]
    # Twice as many rows: the wave tilts the face, and seen from far above or below the horizon the perspective
    # stretches it vertically by up to about 1.8x, which opened gaps (dark lines) between single rows.
    front = np.concatenate([front, front + [0, 0.5 / scale, 0]])
    pad = np.pad(mask, 1)
    edge = mask & ~(pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:])
    blur = mask.astype(float)
    for _ in range(3):  # a soft mask whose gradient gives the outline's normal
        p = np.pad(blur, 1, mode='edge')
        blur = (p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:] + 2 * p[1:-1, 1:-1]) / 6
    gy, gx = np.gradient(blur)
    ev, eu = np.nonzero(edge)
    n = -np.stack([gx[ev, eu], gy[ev, eu]], 1)
    n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-6)
    steps = np.arange(0, depth, 1 / (scale * 1.5))
    side = np.stack([np.repeat(eu, len(steps)) / scale, np.repeat(ev, len(steps)) / scale,
                     np.tile(steps, len(eu))], 1)
    return front, side, np.repeat(n, len(steps), 0)


class Item:
    def __init__(self, text, font, size, centre, bold=0.0, res=1, depth=10.0, focal=80.0):
        """res: output px per menu px (1 classic, HIRES remastered)."""
        self.text, self.font, self.size = text, font, size
        self.centre = centre  # the text's centre in menu coordinates
        self.depth, self.focal = depth, focal
        self.res, self.ss = res, SS if res == 1 else HIRES_SS
        scale = self.ss * res * 1.6  # model px per menu px: denser than the screen samples, so no holes
        mask = glyph_mask(text, font, size, scale, bold)
        self.front, self.side, self.side_n = surface_points(mask, scale, depth)
        self.half = np.array([mask.shape[1], mask.shape[0]]) / scale / 2
        rng = np.random.default_rng(len(text))
        self.grain = rng.random((64, 64))  # brushed-metal grain on the sides

    def place(self, p, t):
        """Model point (u, v, w) -> camera space (x right, y down, z away from the camera; front plane z = 0).

        Animated (t in [0, 1)): 3ds Max's Wave modifier, as the 1998 items use it: the text bulges towards the
        camera and back as a sine of the height, and the wave runs upwards through the text once per loop."""
        x = p[:, 0] - self.half[0]
        y = p[:, 1] - self.half[1]
        z = p[:, 2]
        if t is not None:
            z = z + WAVE_AMP * np.sin(2 * np.pi * (y / WAVE_LEN + t))
        return np.stack([x + self.centre[0] - VP[0], y + self.centre[1] - VP[1], z], 1)

    def normals(self, p, t, dirs):
        """Surface normals from the deformation's Jacobian applied to the two tangents `dirs`."""
        e = 1e-3
        base = self.place(p, t)
        tang = [(self.place(p + e * d, t) - base) / e for d in dirs]
        n = np.cross(tang[0], tang[1])
        return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9), base

    def render(self, t, origin, size):
        """One frame as (rgb, coverage) at `res` output px per menu px; origin = the frame's top-left and size its
        size, in menu coordinates."""
        ss, res = self.ss, self.res
        w, h = size[0] * res * ss, size[1] * res * ss
        pixels, depths, colours = [], [], []
        for face, pts in ((True, self.front), (False, self.side)):
            for c in range(0, len(pts), CHUNK):
                p = pts[c:c + CHUNK]
                if face:
                    n, q = self.normals(p, t, [np.array([1, 0, 0.]), np.array([0, 1, 0.])])
                    n[n[:, 2] > 0] *= -1  # the face looks at the camera (-z)
                else:
                    sn = np.concatenate([self.side_n[c:c + CHUNK], np.zeros((len(p), 1))], 1)
                    tang = np.stack([-sn[:, 1], sn[:, 0], np.zeros(len(sn))], 1)
                    n, q = self.normals(p, t, [tang, np.array([0, 0, 1.])])
                    out = self.place(p + 1e-3 * sn, t) - q  # orient the side normals outwards
                    n[(n * out).sum(1) < 0] *= -1
                view = np.array([0, 0, -self.focal]) - q
                view /= np.linalg.norm(view, axis=1, keepdims=True)
                facing = (n * view).sum(1) > -0.05
                p, q, n, view = p[facing], q[facing], n[facing], view[facing]
                k = self.focal / (self.focal + q[:, 2])
                ix = ((q[:, 0] * k + VP[0] - origin[0]) * res * ss).astype(int)
                iy = ((q[:, 1] * k + VP[1] - origin[1]) * res * ss).astype(int)
                grain = self.grain[(p[:, 0] * 2).astype(int) % 64, (p[:, 2] * 3 + p[:, 1]).astype(int) % 64]
                col = shade(n, view, np.full(len(p), face), grain)
                if not face:
                    rim = p[:, 2] < EDGE
                    col[rim] *= 0.25
                ok = (ix >= 0) & (iy >= 0) & (ix < w) & (iy < h)
                pixels.append(iy[ok] * w + ix[ok])
                depths.append(q[ok, 2].astype(np.float32))
                colours.append(col[ok].astype(np.float32))
        pixels, depths, colours = np.concatenate(pixels), np.concatenate(depths), np.concatenate(colours)
        order = np.argsort(-depths, kind='stable')  # far first; nearer points overwrite them
        rgb = np.zeros((h * w, 3), np.float32)
        cov = np.zeros(h * w, np.float32)
        rgb[pixels[order]] = colours[order]
        cov[pixels[order]] = 1
        rgb = rgb.reshape(size[1] * res, ss, size[0] * res, ss, 3).sum((1, 3))
        cov = cov.reshape(size[1] * res, ss, size[0] * res, ss).sum((1, 3))
        rgb = rgb / np.maximum(cov, 1)[..., None]
        return rgb, cov / ss ** 2


def shade(n, view, is_face, grain):
    diff = np.clip(n @ LIGHT, 0, 1)
    refl = 2 * (n * view).sum(1, keepdims=True) * n - view
    spec = np.clip(refl @ LIGHT, 0, 1) ** 4
    face = np.clip(0.3 + 0.4 * diff + 0.6 * spec, 0, 1)[:, None]
    side = np.clip(0.3 + 0.45 * np.abs(n @ LIGHT) + 0.3 * spec + 0.2 * (grain - 0.5), 0, 1)[:, None]  # chrome-like
    return np.where(is_face[:, None], FACE_DARK + (FACE_LIGHT - FACE_DARK) * face,
                    SIDE_DARK + (SIDE_LIGHT - SIDE_DARK) * side)


def load_data(data):
    meta = json.load(open(os.path.join(data, 'sprites.json')))
    raw = gzip.decompress(open(os.path.join(data, 'sprites.bin.gz'), 'rb').read())
    pal = np.array(json.load(open(os.path.join(data, 'palette.json')))['menus']['HMBILD'])

    def sprite(n):
        o, w, h = meta[str(n)]
        return np.frombuffer(raw[o:o + w * h], np.uint8).reshape(h, w)
    return sprite, pal


def quantize(rgb, cov, colours, pal):
    """The item as rendered on black, then cut out (as the originals were): every pixel's colour fades to black with
    its coverage, so the outline is anti-aliased: near black where the text barely touches a pixel, the face or
    side colour darkened where it covers more. Drawn: the pixels covered at least 40 %, and the partly covered ones
    next to them (at least OUTLINE_COVER), which form the dark outline."""
    a = np.clip(cov, 0, 1)
    c = rgb * (0.06 + 0.94 * a ** 0.8)[..., None]
    p = pal[colours].astype(float)
    d = ((c[..., None, :] - p) ** 2).sum(-1)
    idx = np.array(colours, np.uint8)[d.argmin(-1)]
    opaque = cov >= 0.4
    near = np.pad(opaque, 1)
    near = (near[:-2, 1:-1] | near[2:, 1:-1] | near[1:-1, :-2] | near[1:-1, 2:]
            | near[:-2, :-2] | near[:-2, 2:] | near[2:, :-2] | near[2:, 2:])
    idx[~(opaque | near & (cov >= OUTLINE_COVER))] = 0
    return idx


# German items for the remastered menu (the classic one shows the original sprites): the texts of the 1998 sprites,
# in the font of the English items (DejaVu Sans resembles their Verdana-like letters), sized like the originals.
GERMAN = [('Neues Spiel', 'DejaVu Sans Condensed', 24), ('Spiel laden', 'DejaVu Sans', 21),
          ('Die Geschichte', 'DejaVu Sans', 19), ('Spielanleitung', 'DejaVu Sans', 19),
          ('Horse Productions', 'DejaVu Sans', 18), ('Exit', 'DejaVu Sans', 20)]
# English: all six items in one font, slightly bolder than DejaVu Sans Book (user, session 25).
ENGLISH = [('New Game', 'DejaVu Sans', 23), ('Load Game', 'DejaVu Sans', 21), ('The Story', 'DejaVu Sans', 20),
           ('Manual', 'DejaVu Sans', 20), ('Horse Productions', 'DejaVu Sans', 18), ('Exit', 'DejaVu Sans', 20)]
BOLD = 0.15  # px per side: slightly bolder than DejaVu Sans Book (user, session 25)


def menu_y(i):
    """Where the menu draws item i's sprites (their top-left y; DrawMainMenu)."""
    return 26 + 25 * (i - 1) - (i == 1) * 3


def layout(i, text, font, size, colours, pal, bold):
    """Render item i where the menu shows it, seen by the menu's one camera: its classic frames' top at menu_y(i).
    Returns the item, the render window (origin, size) in menu coordinates, and the 11 classic frames (indices)."""
    y = menu_y(i)
    item = Item(text, font, size, (160, 0), bold)
    width = int(item.half[0] * 2) + 48
    cy = y + item.half[1]
    for _ in range(2):  # the second pass corrects the first guess of the centre
        item.centre = (160, cy)
        origin = (160 - width // 2, round(cy) - 28)
        frames = [quantize(*item.render(None if k == 0 else (k - 1) / 10, origin, (width, 56)), colours, pal)
                  for k in range(FRAMES)]
        cy += y - (origin[1] + np.nonzero(np.any(frames, 0))[0].min())
    ys, xs = np.nonzero(np.any(frames, 0))
    assert ys.min() > 0 and xs.min() > 0 and ys.max() < 55 and xs.max() < width - 1, (text, 'clipped')
    return item, origin, (width, 56), frames


def item_sprites(i, text, font, size, colours, pal, bold=0.0):
    """Item i's 11 frames as sprites (palette indices, 0 = transparent), all from the same top-left like the
    originals, each as wide as its opaque part rounded up to 4 (AniVGA sprite widths)."""
    frames = layout(i, text, font, size, colours, pal, bold)[3]
    ys, xs = np.nonzero(np.any(frames, 0))
    top, left = ys.min(), xs.min()
    out = []
    for f in frames:
        fy, fx = np.nonzero(f)
        w = -(-(fx.max() + 1 - left) // 4) * 4
        out.append(np.ascontiguousarray(np.pad(f, ((0, 0), (0, 4)))[top:fy.max() + 1, left:left + w]))
    return out


def rgba(rgb, cov, res):
    """A remastered frame: the item over a dark outline HIRES_OUTLINE menu px wide, both with soft (anti-aliased)
    edges against transparency, like the classic frames' outline (rendered on black)."""
    r = HIRES_OUTLINE * res
    outline = cov.copy()
    p = int(np.ceil(r))
    pad = np.pad(cov, p)
    for dy in range(-p, p + 1):
        for dx in range(-p, p + 1):
            d = np.hypot(dy, dx)
            if d <= r + 0.5:
                weight = min(1.0, r + 0.5 - d)  # the disc's soft rim
                outline = np.maximum(outline, weight * pad[p + dy:p + dy + cov.shape[0], p + dx:p + dx + cov.shape[1]])
    alpha = cov + outline * (1 - cov)
    colour = rgb * (cov / np.maximum(alpha, 1e-6))[..., None]  # premultiplied over black, divided by the alpha
    return np.dstack([np.clip(colour, 0, 255), np.clip(alpha * 255, 0, 255)]).round().astype(np.uint8)


def hires_item(args):
    """Item i's 11 remastered frames: [(rgba, ox, oy)], ox/oy = where the trimmed picture starts relative to the
    classic sprite's top-left (menu px; hiResView draws it there), the classic sprite being `base_width` wide."""
    i, text, font, size, bold, base_width, colours, pal = args
    item, origin, size_ = layout(i, text, font, size, colours, pal, bold)[:3]
    hi = Item(text, font, size, item.centre, bold, res=HIRES)
    x, y = 160 - base_width // 2, menu_y(i)  # where the menu draws the classic sprite (screens/mainMenu.ts)
    out = []
    for k in range(FRAMES):
        img = rgba(*hi.render(None if k == 0 else (k - 1) / 10, origin, size_), HIRES)
        ys, xs = np.nonzero(img[..., 3])
        out.append((np.ascontiguousarray(img[ys.min():ys.max() + 1, xs.min():xs.max() + 1]),
                    origin[0] + xs.min() / HIRES - x, origin[1] + ys.min() / HIRES - y))
    return out


def hires_items(data, lang):
    """The remastered main menu items of `lang` (GERMAN or ENGLISH): {sprite number: (rgba, ox, oy)}, placed
    relative to the classic sprites (the originals, or english_items()). Renders the items in parallel."""
    from multiprocessing import Pool
    sprite, pal = load_data(data)
    colours = palette_colours(sprite)
    classic = english_items(data) if lang == 'en' else {n: sprite(n) for n in range(FIRST, FIRST + 66)}
    table = ENGLISH if lang == 'en' else GERMAN
    jobs = [(i, text, font, size, BOLD, classic[FIRST + 11 * (i - 1)].shape[1], colours, pal)
            for i, (text, font, size) in enumerate(table, 1)]
    with Pool() as pool:
        items = pool.map(hires_item, jobs)
    return {FIRST + 11 * (i - 1) + k: f for i, frames in enumerate(items, 1) for k, f in enumerate(frames)}


def palette_colours(sprite):
    """The HMBILD colours the original items use."""
    return sorted(set(np.unique(np.concatenate([sprite(n).ravel() for n in range(FIRST, FIRST + 66)]))) - {0})


def english_items(data):
    """The English main menu sprites: {sprite number: indices} for all six items."""
    sprite, pal = load_data(data)
    colours = palette_colours(sprite)
    out = {}
    for i, (text, font, size) in enumerate(ENGLISH, 1):
        for k, f in enumerate(item_sprites(i, text, font, size, colours, pal, BOLD)):
            out[FIRST + 11 * (i - 1) + k] = f
    return out


def compare(data, out, items):
    """German originals (left) next to this renderer's German frames (GERMAN, right), 3x, on magenta."""
    sprite, pal = load_data(data)
    colours = palette_colours(sprite)
    rows = []
    for i in items:
        text, font, size = GERMAN[i - 1]
        orig = [sprite(FIRST + 11 * (i - 1) + k) for k in range(FRAMES)]
        rows.append((orig, item_sprites(i, text, font, size, colours, pal, BOLD)))
    x2 = max(o.shape[1] for orig, _ in rows for o in orig) + 8
    W = x2 + max(m.shape[1] for _, mine in rows for m in mine)
    H = sum(max(a.shape[0] for a in orig + mine) + 2 for orig, mine in rows for _ in range(FRAMES))
    sheet = np.full((H, W, 3), (255, 0, 255), np.uint8)
    y = 0
    for orig, mine in rows:
        h = max(a.shape[0] for a in orig + mine) + 2
        for o, m in zip(orig, mine):
            for img, x0 in ((o, 0), (m, x2)):
                region = sheet[y:y + img.shape[0], x0:x0 + img.shape[1]]
                region[img != 0] = pal[img[img != 0]]
            y += h
    Image.fromarray(sheet).resize((W * 3, H * 3), Image.NEAREST).save(out)


def preview(data, out, sprites=None):
    """The main menu as an animated GIF (3x): the selection runs through the items, each glowing for 20 frames.
    `sprites` overrides the original item sprites (e.g. english_items())."""
    sprite, pal = load_data(data)
    pic = np.frombuffer(gzip.decompress(open(os.path.join(data, 'pictures.bin.gz'), 'rb').read())[:64000],
                        np.uint8).reshape(200, 320)
    get = lambda n: sprites[n] if sprites and n in sprites else sprite(n)
    images = []
    for sel in range(1, 7):
        for step in range(20):
            screen = pic.copy()
            for i in range(1, 7):
                n = FIRST + 11 * (i - 1) + (1 + step % 10 if i == sel else 0)
                img = get(n)
                x = 160 - get(FIRST + 11 * (i - 1)).shape[1] // 2
                y = 26 + 25 * (i - 1) - (i == 1) * 3
                region = screen[y:y + img.shape[0], x:x + img.shape[1]]
                region[img[:region.shape[0], :region.shape[1]] != 0] = img[:region.shape[0], :region.shape[1]][
                    img[:region.shape[0], :region.shape[1]] != 0]
            images.append(Image.fromarray(pal[screen].astype(np.uint8)).resize((960, 600), Image.NEAREST))
    images[0].save(out, save_all=True, append_images=images[1:], duration=50, loop=0)


def hires_sheet(data, out, lang):
    """The remastered frames of `lang` on a mid-grey background, one row per item."""
    frames = hires_items(data, lang)
    rows = [[frames[FIRST + 11 * i + k][0] for k in range(FRAMES)] for i in range(6)]
    W = max(sum(f.shape[1] + 8 for f in r[:4]) for r in rows)
    H = sum(max(f.shape[0] for f in r) + 8 for r in rows) * 3
    sheet = Image.new('RGBA', (W, H), (90, 90, 96, 255))
    y = 0
    for r in rows:
        for line in (r[:4], r[4:8], r[8:]):
            x = 0
            for f in line:
                sheet.alpha_composite(Image.fromarray(f), (x, y))
                x += f.shape[1] + 8
            y += max(f.shape[0] for f in r) + 8
    sheet.convert('RGB').save(out)


if __name__ == '__main__':
    cmd, data, out = sys.argv[1:4]
    if cmd == 'compare':
        compare(data, out, [int(n) for n in sys.argv[4].split(',')] if len(sys.argv) > 4 else range(1, 7))
    elif cmd == 'hires':
        hires_sheet(data, out, sys.argv[4] if len(sys.argv) > 4 else 'de')
    elif cmd == 'preview':
        preview(data, out, english_items(data) if sys.argv[4:] == ['en'] else None)
