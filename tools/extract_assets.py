"""Extract Dark Planet's original assets into modern formats for inspection.

Writes into <output_dir>:
  sfx/    one WAV per sound in the SMIX resource files (AREA.SND, AREA2.SND)
  pics/   full-screen pictures (.PIC + .PAL) as PNG, scaled 3x
  music/  the CD soundtrack split at the candidate track boundaries (see
          build_cd_image.py, which owns the boundary list)

Usage: uv run --with numpy --with pillow python tools/extract_assets.py \
           original_source <output_dir>

Format notes live in docs/file-formats.md.
"""
import os
import struct
import sys
import wave

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from build_cd_image import DATA_BYTES, TRACK_STARTS, sector_aligned_frame  # noqa: E402

SFX_RATE = 22050  # assumed SMIX default; not yet verified against DP.EXE
PICTURES = [('OMBILD.PIC', 'EPIS1.PAL'), ('UMBILD.PIC', 'UMBILD.PAL'),
            ('HMBILD.PIC', 'HMBILD.PAL'), ('RASTER.PIC', 'EPIS1.PAL')]


def read_palette(path):
    """768 bytes of 6-bit VGA RGB -> (256, 3) uint8."""
    raw = np.frombuffer(open(path, 'rb').read(), np.uint8).reshape(256, 3)
    return (raw.astype(int) * 255 // 63).astype(np.uint8)


def read_pic(path):
    """'PIC' + 64000 bytes in Mode X planar order (4 planes of 80x200)."""
    data = open(path, 'rb').read()
    assert data[:3] == b'PIC', path
    planes = np.frombuffer(data[3:], np.uint8).reshape(4, 200, 80)
    return planes.transpose(1, 2, 0).reshape(200, 320)


def read_smix(path):
    """SMIX resource: u16 count, count x (8-char name, u32 offset, u32 size)."""
    data = open(path, 'rb').read()
    count = struct.unpack_from('<H', data, 0)[0]
    for i in range(count):
        name, offset, size = struct.unpack_from('<8sII', data, 2 + 16 * i)
        yield i, name.split(b'\0')[0].decode('ascii'), data[offset:offset + size]


def main(src, out):
    game = os.path.join(src, 'Game')
    for sub in ('sfx', 'pics', 'music'):
        os.makedirs(os.path.join(out, sub), exist_ok=True)

    for snd in ('AREA.SND', 'AREA2.SND'):
        for i, name, pcm in read_smix(os.path.join(game, snd)):
            with wave.open(os.path.join(out, 'sfx', f'{snd[:-4]}_{i:02d}_{name}.wav'), 'wb') as w:
                w.setnchannels(1)
                w.setsampwidth(1)  # 8-bit unsigned
                w.setframerate(SFX_RATE)
                w.writeframes(pcm)

    for pic, pal in PICTURES:
        pixels = read_palette(os.path.join(game, pal))[read_pic(os.path.join(game, pic))]
        Image.fromarray(pixels).resize((960, 600), Image.NEAREST).save(
            os.path.join(out, 'pics', pic[:-4] + '.png'))

    audio = np.fromfile(os.path.join(src, 'Image', 'DPImage.iso'), '<i2', offset=DATA_BYTES)
    audio = audio.reshape(-1, 2)
    starts = [sector_aligned_frame(s) for s in TRACK_STARTS] + [len(audio)]
    for n, (a, b) in enumerate(zip(starts, starts[1:]), start=2):
        with wave.open(os.path.join(out, 'music', f'track{n:02d}.wav'), 'wb') as w:
            w.setnchannels(2)
            w.setsampwidth(2)
            w.setframerate(44100)
            w.writeframes(audio[a:b].tobytes())


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
