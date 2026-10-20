"""Upscale the game's sprites and level backgrounds 4x for the remastered renderer (experiment, branch
remaster-experiment).

Reads the engine data (game/public/data/, tools/export_engine_data.py) and writes, per method:
  <out>/<method>/level<N>/<i>.webp   level N's background in chunks of 256 source rows (1024 px), chunk i
                                     covering level y -6200 + 256 i ...; 1280 px wide (the 10 tile columns)
  <out>/<method>/<group>_<p>.webp    sprite atlas pages, 4096 x 4096 at most
  <out>/<method>/sprites.json        {group: pages, sprites: {n: [group, page, x, y, w, h, ox, oy]}}: the trimmed
                                     sprite at (x, y, w, h) on its page (4x px), drawn at (ox, oy) source px
                                     from the sprite's top-left corner
Groups: "common" (jets, pods, shots, explosions, boni, HUD, REST.LIB) and one per episode (enemies and
wrecks), so a level loads only what it can show. SHOP.LIB is left out (the menus stay classic).

The whole level is upscaled as one picture, so the tiles have their real neighbours and no seams. Sprites
are upscaled in colour and outline separately: transparent pixels take the nearest opaque colour first (so no
black seeps into the edges), and the outline (the opaque mask, upscaled the same way) becomes the alpha.

Methods: nearest (reference), hq4x and xbr4 (ffmpeg's pixel-art filters), esrgan (Real-ESRGAN x4plus),
esrgan-anime (x4plus-anime), animevideo (realesr-animevideov3 x4). Real-ESRGAN is the ncnn-vulkan build in
~/opt/realesrgan (github.com/xinntao/Real-ESRGAN, release v0.2.5.0); REALESRGAN_GPU picks the Vulkan device.

Usage: uv run --with numpy --with pillow python tools/remaster_upscale.py game/public/data game/public/remaster \
           [methods, comma-separated] [levels, comma-separated]
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
PAD = 4  # source px around each sprite on a page (keeps neighbours out of the filters)
GROUPS = [('common', lambda n: n < 493 or 544 <= n < 850),  # SHOP.LIB = 493..543
          ('episode1', lambda n: 850 <= n < 1024),
          ('episode2', lambda n: n >= 1024)]
ESRGAN = os.path.expanduser('~/opt/realesrgan/realesrgan-ncnn-vulkan')
ESRGAN_MODELS = {'esrgan': 'realesrgan-x4plus', 'esrgan-anime': 'realesrgan-x4plus-anime',
                 'animevideo': 'realesr-animevideov3'}
METHODS = ['hq4x']  # the user's choice (session 17); the others stay for comparisons


def load(data):
    palette = np.array(json.load(open(os.path.join(data, 'palette.json')))['rgb'], np.uint8)
    index = json.load(open(os.path.join(data, 'sprites.json')))
    pixels = np.frombuffer(gzip.open(os.path.join(data, 'sprites.bin.gz')).read(), np.uint8)
    sprites = {int(n): pixels[o:o + w * h].reshape(h, w) for n, (o, w, h) in index.items()}
    tiles = [np.frombuffer(gzip.open(os.path.join(data, 'tiles%d.bin.gz' % e)).read(), np.uint8).reshape(-1, 32, 32)
             for e in (1, 2)]
    levels = json.load(open(os.path.join(data, 'levels.json')))
    return palette, sprites, tiles, levels


def level_image(level, tiles, palette):
    """The whole level as RGB, top row = level y -6200 (file row 0 is at the bottom, see Framebuffer.background)."""
    rows = level['tiles']
    img = np.zeros((32 * LEVEL_ROWS, 320), np.uint8)
    for r, cells in enumerate(rows):
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
    elif method in ('hq4x', 'xbr4'):
        vf = 'hqx=4' if method == 'hq4x' else 'xbr=4'
        for p in paths:
            tmp = p + '.out.png'
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', p, '-vf', vf + ',format=rgb24', tmp], check=True)
            os.replace(tmp, p)
    else:
        src, dst = tempfile.mkdtemp(), tempfile.mkdtemp()
        for i, p in enumerate(paths):
            shutil.copy(p, os.path.join(src, '%05d.png' % i))
        cmd = [ESRGAN, '-i', src, '-o', dst, '-n', ESRGAN_MODELS[method], '-s', '4', '-f', 'png',
               '-m', os.path.join(os.path.dirname(ESRGAN), 'models')]
        if os.environ.get('REALESRGAN_GPU'):
            cmd += ['-g', os.environ['REALESRGAN_GPU']]
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for i, p in enumerate(paths):
            Image.open(os.path.join(dst, '%05d.png' % i)).convert('RGB').save(p)
        shutil.rmtree(src)
        shutil.rmtree(dst)


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


def smooth_alpha(mask):
    """The upscaled outline as alpha: keep a narrow soft edge (antialiasing), not a blur."""
    a = mask.astype(np.float32) / 255
    a = np.clip((a - 0.5) / 0.3 + 0.5, 0, 1)
    return (a * 255 + 0.5).astype(np.uint8)


def main(data, out, methods, level_numbers):
    palette, sprites, tiles, levels = load(data)
    work = tempfile.mkdtemp()
    for method in methods:
        dst = os.path.join(out, method)
        os.makedirs(dst, exist_ok=True)
        # backgrounds
        for n in level_numbers:
            path = os.path.join(work, 'level.png')
            Image.fromarray(level_image(levels[n - 1], tiles[0 if n <= 3 else 1], palette)).save(path)
            upscale(method, [path])
            img = Image.open(path)
            ldir = os.path.join(dst, 'level%d' % n)
            os.makedirs(ldir, exist_ok=True)
            for i in range(32 * LEVEL_ROWS // CHUNK):
                img.crop((0, i * CHUNK * SCALE, img.width, (i + 1) * CHUNK * SCALE)).save(
                    os.path.join(ldir, '%d.webp' % i), quality=90, method=4)
            print(method, 'level', n)
        # sprites
        index, groups = {}, {}
        for group, member in GROUPS:
            chosen = {n: t for n in sorted(sprites) if member(n) and (t := trimmed(sprites[n])) is not None}
            placed, count = pack(chosen)
            groups[group] = count
            rgb_paths, mask_paths = [], []
            for p in range(count):
                idx = np.zeros((PAGE, PAGE), np.uint8)
                for n, (page, x, y, w, h, ox, oy) in placed.items():
                    if page == p:
                        idx[y:y + h, x:x + w] = chosen[n][0]
                mask = idx != 0
                rgb_paths.append(os.path.join(work, '%s_%d_rgb.png' % (group, p)))
                mask_paths.append(os.path.join(work, '%s_%d_mask.png' % (group, p)))
                Image.fromarray(bleed(palette[idx], mask)).save(rgb_paths[-1])
                Image.fromarray(np.repeat((mask * 255).astype(np.uint8)[..., None], 3, 2)).save(mask_paths[-1])
            upscale(method, rgb_paths + mask_paths)
            for p in range(count):
                rgb = np.asarray(Image.open(rgb_paths[p]).convert('RGB'))
                alpha = smooth_alpha(np.asarray(Image.open(mask_paths[p]).convert('L')))
                if method == 'nearest':
                    alpha = np.asarray(Image.open(mask_paths[p]).convert('L'))
                Image.fromarray(np.dstack([rgb, alpha])).save(os.path.join(dst, '%s_%d.webp' % (group, p)),
                                                              quality=92, method=4)
            for n, (page, x, y, w, h, ox, oy) in placed.items():
                index[n] = [group, page, x * SCALE, y * SCALE, w * SCALE, h * SCALE, ox, oy]
            print(method, group, len(placed), 'sprites,', count, 'pages')
        with open(os.path.join(dst, 'sprites.json'), 'w') as f:
            json.dump({'scale': SCALE, 'chunk': CHUNK, 'groups': groups, 'sprites': index}, f)
    shutil.rmtree(work)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2],
         sys.argv[3].split(',') if len(sys.argv) > 3 else METHODS,
         [int(n) for n in sys.argv[4].split(',')] if len(sys.argv) > 4 else [1, 2, 3, 4, 5, 6])
