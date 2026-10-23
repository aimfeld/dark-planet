"""Upscale the game's graphics 4x for the remastered renderer (game/src/render/hiResView.ts).

Reads the engine data (game/public/data/, tools/export_engine_data.py) and writes, per method:
  <out>/<method>/level<N>/<i>.avif      level N's background in chunks of 256 source rows (1024 px), chunk i
                                        covering level y -6200 + 256 i ...; 1280 px wide (the 10 tile columns)
  <out>/<method>/<group>_<p>.avif       sprite atlas pages, 4096 x 4096 at most
  <out>/<method>/picture_<PIC>_<PAL>.avif  the full-screen PIC backgrounds in the palette their screen uses
  <out>/<method>/font_<NAME>.avif       glyph atlases: mono fonts white (the renderer tints them with the ink
                                        colour), multicolour fonts in EPIS1 colours
  <out>/<method>/index.json             {scale, chunk, groups: {group: pages},
                                         sprites: {palette: {n: [group, page, x, y, w, h, ox, oy]}},
                                         english: {palette: {n: ...}} (the same for sprites-en.json),
                                         pictures: {"PIC_PAL": file}, fonts: {name: {file, cell, glyphs}}}
Sprite entries: the trimmed sprite at (x, y, w, h) on its page (4x px), drawn at (ox, oy) source px from the
sprite's top-left corner. Font glyphs: code -> [x, y] of the glyph cell's top-left corner (4x px).

Groups: "common" (jets, pods, shots, explosions, boni, HUD, REST.LIB), "shop" (SHOP.LIB) and one per episode
(enemies and wrecks), all in EPIS1; REST.LIB again in the main menu's (HMBILD) and the hangar's (UMBILD)
palette. So a screen loads only what it can show. The English sprites (sprites-en.json, tools/export_english_sprites.py)
go into "shop" (the panel), indexed under "english" like "sprites". The main menu items (both languages) are
rendered directly at 4x by tools/menu_items.py into the group "menuitems" (do_menu_items).

The whole level is upscaled as one picture, so the tiles have their real neighbours and no seams. Sprites and
glyphs are upscaled in colour and outline separately: transparent pixels take the nearest opaque colour first
(so no black seeps into the edges), and the outline (the opaque mask, upscaled the same way) becomes the alpha.

Methods: hq4x (the user's choice, session 17), and for comparisons nearest and xbr4 (ffmpeg's pixel-art filters).
Real-ESRGAN was compared too (session 17, it smears the dirt textures) and removed in session 18.

Format (session 18): AVIF, 4:4:4. Level 1 at quality 60 is 1.1 MB and closer to the lossless upscale (PSNR 42) than
the WebP at quality 90 used before (3.0 MB, PSNR 38); WebP below 90 smooths away the dirt grain. Needs Pillow 11.3+.

Usage: uv run --with numpy --with 'pillow>=11.3' python tools/remaster_upscale.py game/public/data game/public/remaster \
           [methods, comma-separated] [levels, comma-separated; '' = none]
"""
import gzip
import json
import os
import shutil
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image

SCALE = 4
CHUNK = 256  # source rows per background chunk
LEVEL_ROWS = 200  # tile rows of 32 px: level y -6200 .. 199
PAGE = 1024  # atlas page size in source px (4096 upscaled)
PAD = 4  # source px around each sprite or glyph (keeps neighbours out of the filters)
REST = range(544, 850)
MENU_ITEMS = range(613, 679)  # rendered directly at 4x (tools/menu_items.py), not upscaled
GROUPS = [('common', 'EPIS1', lambda n: n < 493 or n in REST),  # n: sprite number, or 'en' + number
          ('shop', 'EPIS1', lambda n: 493 <= n < 544, ['en501']),
          ('episode1', 'EPIS1', lambda n: 850 <= n < 1024),
          ('episode2', 'EPIS1', lambda n: n >= 1024),
          ('menu', 'HMBILD', lambda n: n in REST and n not in MENU_ITEMS),
          ('hangar', 'UMBILD', lambda n: n in REST)]
PICTURES = ['HMBILD', 'UMBILD', 'OMBILD', 'RASTER']  # tools/export_engine_data.py order
PICTURE_PALETTES = {'HMBILD': 'HMBILD', 'UMBILD': 'UMBILD', 'OMBILD': 'EPIS1', 'RASTER': 'EPIS1'}  # screens/*.ts
QUALITY = 60  # AVIF; the sprite and font atlases' alpha edges are saved with the same setting
METHODS = ['hq4x']


def load(data):
    pal = json.load(open(os.path.join(data, 'palette.json')))
    palettes = {'EPIS1': np.array(pal['rgb'], np.uint8),
                **{k: np.array(v, np.uint8) for k, v in pal['menus'].items()}}
    index = json.load(open(os.path.join(data, 'sprites.json')))
    pixels = np.frombuffer(gzip.open(os.path.join(data, 'sprites.bin.gz')).read(), np.uint8)
    sprites = {int(n): pixels[o:o + w * h].reshape(h, w) for n, (o, w, h) in index.items()}
    index = json.load(open(os.path.join(data, 'sprites-en.json')))
    pixels = np.frombuffer(gzip.open(os.path.join(data, 'sprites-en.bin.gz')).read(), np.uint8)
    sprites.update({'en%s' % n: pixels[o:o + w * h].reshape(h, w) for n, (o, w, h) in index.items()})
    tiles = [np.frombuffer(gzip.open(os.path.join(data, 'tiles%d.bin.gz' % e)).read(), np.uint8).reshape(-1, 32, 32)
             for e in (1, 2)]
    levels = json.load(open(os.path.join(data, 'levels.json')))
    pics = np.frombuffer(gzip.open(os.path.join(data, 'pictures.bin.gz')).read(), np.uint8).reshape(-1, 200, 320)
    fonts_index = json.load(open(os.path.join(data, 'fonts.json')))
    font_bin = np.frombuffer(gzip.open(os.path.join(data, 'fonts.bin.gz')).read(), np.uint8)
    fonts = {name: (f, font_bin[f['offset']:f['offset'] + 256 * f['width'] * f['height']]
                    .reshape(256, f['height'], f['width'])) for name, f in fonts_index.items()}
    return palettes, sprites, tiles, levels, dict(zip(PICTURES, pics)), fonts


def level_image(level, tiles, palette):
    """The whole level as RGB, top row = level y -6200 (file row 0 is at the bottom, see Framebuffer.background)."""
    img = np.zeros((32 * LEVEL_ROWS, 320), np.uint8)
    for r, cells in enumerate(level['tiles']):
        y = 32 * (LEVEL_ROWS - 1 - r)
        for c, t in enumerate(cells):
            img[y:y + 32, 32 * c:32 * c + 32] = tiles[t - 1]
    return palette[img]


def upscale(method, paths):
    """Upscale PNG files in place (RGB, 4x)."""
    if method == 'nearest':
        for p in paths:
            im = Image.open(p)
            im.resize((im.width * SCALE, im.height * SCALE), Image.NEAREST).save(p)
    else:
        vf = 'hqx=4' if method == 'hq4x' else 'xbr=4'
        for p in paths:
            tmp = p + '.out.png'
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', p, '-vf', vf + ',format=rgb24', tmp], check=True)
            os.replace(tmp, p)


def save(img, path):
    img.save(path, 'avif', quality=QUALITY, speed=4, subsampling='4:4:4')


def bleed(rgb, mask):
    """Give transparent pixels the colour of the nearest opaque one (grows the opaque area ring by ring)."""
    rgb, known = rgb.astype(np.int32), mask.copy()
    for _ in range(2 * PAD):
        if known.all():
            break
        acc = np.zeros_like(rgb)
        cnt = np.zeros(mask.shape, np.int32)
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)):
            k = np.roll(known, (dy, dx), (0, 1))
            acc += np.roll(rgb, (dy, dx), (0, 1)) * k[..., None]
            cnt += k
        new = ~known & (cnt > 0)
        rgb[new] = acc[new] // cnt[new][:, None]
        known |= new
    return rgb.astype(np.uint8)


def smooth_alpha(mask):
    """The upscaled outline as alpha: keep a narrow soft edge (antialiasing), not a blur."""
    a = mask.astype(np.float32) / 255
    a = np.clip((a - 0.5) / 0.3 + 0.5, 0, 1)
    return (a * 255 + 0.5).astype(np.uint8)


def upscale_rgba(method, work, images):
    """Palette-index images (0 = transparent) with their palettes -> upscaled RGBA arrays."""
    rgb_paths, mask_paths = [], []
    for i, (idx, palette) in enumerate(images):
        mask = idx != 0
        rgb_paths.append(os.path.join(work, '%d_rgb.png' % i))
        mask_paths.append(os.path.join(work, '%d_mask.png' % i))
        Image.fromarray(bleed(palette[idx], mask)).save(rgb_paths[-1])
        Image.fromarray(np.repeat((mask * 255).astype(np.uint8)[..., None], 3, 2)).save(mask_paths[-1])
    upscale(method, rgb_paths + mask_paths)
    out = []
    for rp, mp in zip(rgb_paths, mask_paths):
        mask = np.asarray(Image.open(mp).convert('L'))
        alpha = mask if method == 'nearest' else smooth_alpha(mask)
        out.append(np.dstack([np.asarray(Image.open(rp).convert('RGB')), alpha]))
    return out


def pack(sprites):
    """Shelf-pack trimmed sprites (number order keeps animations together) onto PAGE x PAGE pages."""
    pages, placed = [[]], {}
    x = y = shelf = 0
    for n, (img, ox, oy) in sprites.items():
        h, w = img.shape
        if x + w + PAD > PAGE:
            x, y, shelf = 0, y + shelf + PAD, 0
        if y + h + 2 * PAD > PAGE:
            pages.append([])
            x = y = shelf = 0
        placed[n] = (len(pages) - 1, x + PAD, y + PAD, w, h, ox, oy)
        pages[-1].append(n)
        x += w + PAD
        shelf = max(shelf, h + PAD)
    return placed, len(pages)


def trimmed(px):
    ys, xs = np.nonzero(px)
    if len(ys) == 0:
        return None
    return px[ys.min():ys.max() + 1, xs.min():xs.max() + 1], int(xs.min()), int(ys.min())


def do_levels(method, dst, levels, tiles, palette, numbers, work):
    for n in numbers:
        path = os.path.join(work, 'level.png')
        Image.fromarray(level_image(levels[n - 1], tiles[0 if n <= 3 else 1], palette)).save(path)
        upscale(method, [path])
        img = Image.open(path)
        ldir = os.path.join(dst, 'level%d' % n)
        os.makedirs(ldir, exist_ok=True)
        for i in range(32 * LEVEL_ROWS // CHUNK):
            save(img.crop((0, i * CHUNK * SCALE, img.width, (i + 1) * CHUNK * SCALE)), os.path.join(ldir, '%d.avif' % i))
        print(method, 'level', n, flush=True)


def do_sprites(method, dst, sprites, palettes, work):
    index, groups = {}, {}
    for group, pal, member, *english in GROUPS:
        chosen = {n: t for n in [n for n in sorted(k for k in sprites if isinstance(k, int)) if member(n)]
                  + (english[0] if english else []) if (t := trimmed(sprites[n])) is not None}
        placed, count = pack(chosen)
        groups[group] = count
        pages = []
        for p in range(count):
            idx = np.zeros((PAGE, PAGE), np.uint8)
            for n, (page, x, y, w, h, ox, oy) in placed.items():
                if page == p:
                    idx[y:y + h, x:x + w] = chosen[n][0]
            pages.append((idx, palettes[pal]))
        for p, rgba in enumerate(upscale_rgba(method, work, pages)):
            save(Image.fromarray(rgba), os.path.join(dst, '%s_%d.avif' % (group, p)))
        for n, (page, x, y, w, h, ox, oy) in placed.items():
            entries = index.setdefault('english' if isinstance(n, str) else 'sprites', {}).setdefault(pal, {})
            entries[str(n).removeprefix('en')] = [group, page, x * SCALE, y * SCALE, w * SCALE, h * SCALE, ox, oy]
        print(method, group, len(placed), 'sprites,', count, 'pages', flush=True)
    return index, groups


def do_menu_items(dst, data, index, groups):
    """The main menu items in both languages, rendered at 4x (tools/menu_items.py hires_items) instead of
    upscaled: group "menuitems", indexed under "sprites" (German) and "english" in the HMBILD palette."""
    import menu_items
    frames = {(lang, n): f for lang in ('de', 'en') for n, f in menu_items.hires_items(data, lang).items()}
    size, pad = PAGE * SCALE, PAD * SCALE
    pages, x, y, shelf = [Image.new('RGBA', (size, size))], pad, pad, 0
    for (lang, n), (img, ox, oy) in frames.items():
        h, w = img.shape[:2]
        if x + w + pad > size:
            x, y, shelf = pad, y + shelf + pad, 0
        if y + h + pad > size:
            pages.append(Image.new('RGBA', (size, size)))
            x, y, shelf = pad, pad, 0
        pages[-1].paste(Image.fromarray(img), (x, y))
        key = 'english' if lang == 'en' else 'sprites'
        index.setdefault(key, {}).setdefault('HMBILD', {})[str(n)] = ['menuitems', len(pages) - 1, x, y, w, h,
                                                                      round(ox, 3), round(oy, 3)]
        x += w + pad
        shelf = max(shelf, h)
    for p, page in enumerate(pages):
        save(page, os.path.join(dst, 'menuitems_%d.avif' % p))
    groups['menuitems'] = len(pages)
    print('menu items', len(frames), 'frames,', len(pages), 'pages', flush=True)


def do_pictures(method, dst, pictures, palettes, work):
    out = {}
    for name, pal in PICTURE_PALETTES.items():
        path = os.path.join(work, 'pic.png')
        Image.fromarray(palettes[pal][pictures[name]]).save(path)
        upscale(method, [path])
        file = 'picture_%s_%s.avif' % (name, pal)
        save(Image.open(path), os.path.join(dst, file))
        out['%s_%s' % (name, pal)] = file
    print(method, 'pictures', flush=True)
    return out


def do_fonts(method, dst, fonts, palettes, work):
    """Each font as a 16 x 16 grid of glyph cells with PAD around each."""
    white = np.zeros((256, 3), np.uint8)
    white[1] = 255
    out = {}
    for name, (f, glyphs) in fonts.items():
        cw, ch = f['width'] + 2 * PAD, f['height'] + 2 * PAD
        idx = np.zeros((16 * ch, 16 * cw), np.uint8)
        pos = {}
        for code in range(256):
            x, y = (code % 16) * cw + PAD, (code // 16) * ch + PAD
            g = glyphs[code]
            idx[y:y + f['height'], x:x + f['width']] = g if f['multicolor'] else (g != 0)
            pos[code] = [x * SCALE, y * SCALE]
        [rgba] = upscale_rgba(method, work, [(idx, palettes['EPIS1'] if f['multicolor'] else white)])
        if not f['multicolor']:
            rgba[..., :3] = 255  # the ink colour is the renderer's tint
        file = 'font_%s.avif' % name
        save(Image.fromarray(rgba), os.path.join(dst, file))
        out[name] = {'file': file, 'cell': [f['width'] * SCALE, f['height'] * SCALE], 'glyphs': pos}
    print(method, 'fonts', flush=True)
    return out


def main(data, out, methods, level_numbers):
    palettes, sprites, tiles, levels, pictures, fonts = load(data)
    work = tempfile.mkdtemp()
    for method in methods:
        dst = os.path.join(out, method)
        os.makedirs(dst, exist_ok=True)
        do_levels(method, dst, levels, tiles, palettes['EPIS1'], level_numbers, work)
        index, groups = do_sprites(method, dst, sprites, palettes, work)
        do_menu_items(dst, data, index, groups)
        pics = do_pictures(method, dst, pictures, palettes, work)
        font_index = do_fonts(method, dst, fonts, palettes, work)
        with open(os.path.join(dst, 'index.json'), 'w') as f:
            json.dump({'scale': SCALE, 'chunk': CHUNK, 'groups': groups, **index, 'pictures': pics,
                       'fonts': font_index}, f)
    shutil.rmtree(work)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2],
         sys.argv[3].split(',') if len(sys.argv) > 3 else METHODS,
         [int(n) for n in sys.argv[4].split(',') if n] if len(sys.argv) > 4 else [1, 2, 3, 4, 5, 6])
