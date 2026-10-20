"""Encode the intro and ending videos for the browser game: game/public/video/{intro,ending}.webm.

The original plays them with AAPLAY.EXE (Autodesk Animator Player 1.0, Turbo C) from the playlists INTRO.TXT
and ENDING.TXT, while STARTAUD plays CD track 4 (intro) or 9 (ending). Each playlist line is
`file.fli [-L loops] [-T FADEin|FADEout]` (docs/re-notes.md "Intro and ending videos"):
- every FLI frame is shown for the header's speed (5 jiffies of 1/70 s = 14 fps);
- -L n plays the file n times (LOJAN2.FLI is a one-frame logo held for 60 loops = 4.3 s);
- FADEin / FADEout are white flashes (AAPLAY 0x3:0x990 / 0xa84): the palette starts all white (63) and moves
  to the first frame's palette in 10 steps, or from the last frame's palette to white in 10 steps;
  step k of 10 moves each 6-bit value by (target - value) div (11 - k); each step is Delay(2) + one retrace.

The whole playlist becomes one video with the timing baked in: frames are generated at 70 fps (one VGA
retrace) and duplicates are dropped (variable frame rate). Every source pixel becomes 2 x 2, so the 4:2:0
chroma of VP9 doesn't smear the 256-colour pictures. Silent: the game plays the CD track itself.
Needs ffmpeg with libvpx-vp9.

Usage: python3 tools/export_videos.py original_source game/public/video
"""
import os
import struct
import subprocess
import sys

W, H = 320, 200
RETRACE_HZ = 70
FADE_STEPS = 10
SCALE = 2
CRF = 34
PLAYLISTS = {'intro': 'INTRO.TXT', 'ending': 'ENDING.TXT'}


def parse_playlist(path):
    """[(file, loops, fade_in, fade_out)] from an AAPLAY script."""
    out = []
    for line in open(path, encoding='cp437').read().splitlines():
        words = line.split()
        if not words:
            continue
        loops, fade_in, fade_out = 1, False, False
        i = 1
        while i < len(words):
            opt = words[i].upper()
            if opt == '-L':
                loops = int(words[i + 1])
                i += 2
            elif opt == '-T':
                fade_in |= words[i + 1].upper() == 'FADEIN'
                fade_out |= words[i + 1].upper() == 'FADEOUT'
                i += 2
            else:
                raise ValueError('unknown option %r in %s' % (words[i], path))
        out.append((words[0].upper(), loops, fade_in, fade_out))
    return out


def fli_frames(path):
    """The FLI's frames as RGB24 (without the ring frame) and its speed in 1/70 s."""
    with open(path, 'rb') as f:
        _size, magic, frames, w, h, _depth, _flags, speed = struct.unpack('<IHHHHHHH', f.read(18))
    assert magic == 0xAF11 and (w, h) == (W, H), path  # FLI: speed in 1/70 s
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:'],
                         capture_output=True, check=True).stdout
    n = len(raw) // (W * H * 3)
    assert n in (frames, frames + 1), (path, n, frames)
    return [raw[i * W * H * 3:(i + 1) * W * H * 3] for i in range(frames)], speed


def to6(rgb):
    """8-bit RGB back to the VGA's 6-bit DAC values (ffmpeg expands v to v << 2 | v >> 4)."""
    return bytes(v >> 2 for v in rgb)


def to8(dac):
    return bytes((v << 2) | (v >> 4) for v in dac)


def fade_steps(frame, to_white):
    """The 10 palette steps of a white flash applied to one frame (per 6-bit value, like the palette)."""
    src = to6(frame)
    # the steps work on palette entries; map each distinct value once
    table = []
    for v in range(64):
        cur, target = (v, 63) if to_white else (63, v)
        row = []
        for div in range(FADE_STEPS, 0, -1):
            cur += (target - cur) // div if target >= cur else -((cur - target) // div)
            row.append(cur)
        table.append(row)
    return [to8(bytes(table[v][k] for v in src)) for k in range(FADE_STEPS)]


def encode(src_dir, playlist, path):
    enc = subprocess.Popen(
        ['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '%dx%d' % (W, H),
         '-r', str(RETRACE_HZ), '-i', 'pipe:',
         '-vf', 'scale=iw*%d:ih*%d:flags=neighbor,mpdecimate=hi=1:lo=1:frac=0:max=0' % (SCALE, SCALE), '-fps_mode', 'vfr',
         '-c:v', 'libvpx-vp9', '-crf', str(CRF), '-b:v', '0', '-row-mt', '1', '-pix_fmt', 'yuv420p',
         # bitexact: no random segment UID or encoder tag, so the same input gives the same bytes
         '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:v', '+bitexact', '-an', path],
        stdin=subprocess.PIPE)
    ticks = 0

    def emit(frame, n):
        nonlocal ticks
        for _ in range(n):
            enc.stdin.write(frame)
        ticks += n

    for name, loops, fade_in, fade_out in playlist:
        frames, speed = fli_frames(os.path.join(src_dir, name))
        seq = frames * loops
        for i, frame in enumerate(seq):
            if i == 0 and fade_in:
                for step in fade_steps(frame, to_white=False):
                    emit(step, 1)
            emit(frame, speed)
        if fade_out:
            for step in fade_steps(seq[-1], to_white=True):
                emit(step, 1)
    enc.stdin.close()
    if enc.wait() != 0:
        raise SystemExit('ffmpeg failed for ' + path)
    return ticks / RETRACE_HZ


def main(src, out):
    game = os.path.join(src, 'Game')
    os.makedirs(out, exist_ok=True)
    for name, script in PLAYLISTS.items():
        path = os.path.join(out, name + '.webm')
        seconds = encode(game, parse_playlist(os.path.join(game, script)), path)
        print('%s: %.1f s, %d KB' % (path, seconds, os.path.getsize(path) // 1024))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
