"""Measure the background scroll speed in a DOSBox-X gameplay capture.

DP.EXE scrolls the background by exactly 1 px per game frame (ScrollStep @0x15F68),
so the scroll speed in px/s is the game's frame rate. For each pair of captured
frames this finds the vertical shift (0..6 px) that best matches the playfield,
then prints the speed per 10-second window and over the whole scrolling stretch.

Usage: uv run --with numpy python tools/measure_scroll.py <capture.avi>
"""
import subprocess
import sys
from collections import Counter
from fractions import Fraction

import numpy as np

W, H = 320, 200
MAX_SHIFT = 6


def frame_shifts(path):
    """Yield the best downward shift of the playfield between consecutive frames."""
    ffmpeg = subprocess.Popen(['ffmpeg', '-v', 'quiet', '-i', path, '-vf', 'scale=320:200:flags=neighbor',
                               '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], stdout=subprocess.PIPE)
    prev = None
    try:
        while len(buf := ffmpeg.stdout.read(W * H)) == W * H:
            frame = np.frombuffer(buf, np.uint8).reshape(H, W).astype(np.int16)[:, 40:280]  # skip the HUD
            if prev is not None:
                errors = [np.mean(np.abs(frame[20 + s:180 + s] - prev[20:180]) > 8)
                          for s in range(MAX_SHIFT + 1)]
                yield int(np.argmin(errors))
            prev = frame
    finally:
        ffmpeg.kill()
        ffmpeg.wait()


def main(path):
    rate = float(Fraction(subprocess.check_output(
        ['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=r_frame_rate',
         '-of', 'csv=p=0', path]).decode().strip()))  # 70.086 for DOSBox-X VGA captures
    shifts = np.array(list(frame_shifts(path)))
    shifts[shifts > 1] = 0  # cuts, flashes and explosions, not scrolling
    window = int(rate * 10)
    for start in range(0, len(shifts), window):
        w = shifts[start:start + window]
        print(f'{start / rate:7.1f} s  {w.sum() / (len(w) / rate):5.1f} px/s  {dict(sorted(Counter(w.tolist()).items()))}')
    moving = np.nonzero(shifts)[0]
    if len(moving):
        a, b = moving[0], moving[-1]
        total = int(shifts[a:b + 1].sum())
        print(f'scrolling {a / rate:.1f}-{b / rate:.1f} s: {total} px in {(b - a) / rate:.1f} s'
              f' = {total / ((b - a) / rate):.2f} px/s (capture {rate:.3f} fps)')


if __name__ == '__main__':
    main(sys.argv[1])
