"""Encode the CD soundtrack for the browser game: game/public/music/trackNN.mp3 (CD tracks 2-9).

The PCM comes straight from Image/DPImage.iso (after the ISO 9660 filesystem), split at the track starts of
build_cd_image.py. Both channels are identical (docs/re-notes.md "Soundtrack"), so the tracks are mono.
MP3 because every browser decodes it (Ogg/WebM Opus is still unreliable in Safari, session 7); LAME VBR -V5
keeps the whole soundtrack at about 12 MB. Needs ffmpeg with libmp3lame.

Usage: python3 tools/export_music.py original_source game/public/music
"""
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(__file__))
from build_cd_image import DATA_BYTES, FRAME_BYTES, TRACK_STARTS, sector_aligned_frame  # noqa: E402

LAME_VBR_QUALITY = 5  # -V5: about 68 kbps for this mono music


def main(src, out):
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(src, 'Image', 'DPImage.iso'), 'rb') as f:
        f.seek(DATA_BYTES)
        audio = f.read()
    total = len(audio) // FRAME_BYTES
    starts = [sector_aligned_frame(s) for s in TRACK_STARTS] + [total]
    for n, (a, b) in enumerate(zip(starts, starts[1:]), start=2):
        path = os.path.join(out, 'track%02d.mp3' % n)
        # bitexact + no metadata: the same input gives the same bytes (no encoder version tag)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 's16le', '-ar', '44100', '-ac', '2', '-i', 'pipe:',
                        '-ac', '1', '-c:a', 'libmp3lame', '-q:a', str(LAME_VBR_QUALITY), '-map_metadata', '-1',
                        '-fflags', '+bitexact', '-flags:a', '+bitexact', path],
                       input=audio[a * FRAME_BYTES:b * FRAME_BYTES], check=True)
        print('%s: %.2f min, %d KB' % (path, (b - a) / 44100 / 60, os.path.getsize(path) // 1024))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
