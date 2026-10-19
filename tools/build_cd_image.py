"""Rebuild a proper mixed-mode CD image (data track + CD-DA tracks) from DPImage.iso.

The original image was captured as a single data track: the ISO 9660 filesystem
occupies the first 36755 sectors, followed by the soundtrack as raw 44.1 kHz
16-bit LE stereo PCM. Emulators therefore see no audio tracks. This script
splits the image into DATA.ISO plus one WAV per audio track and writes a CUE
sheet that DOSBox(-X) can mount with `imgmount d dplanet.cue -t cdrom`.

Usage: python3 build_cd_image.py <DPImage.iso> <output_dir>
"""
import os
import sys
import wave

DATA_BYTES = 36755 * 2048          # end of the ISO 9660 filesystem
FRAME_BYTES = 4                     # 16-bit stereo
CDDA_SECTOR_FRAMES = 588            # 2352 bytes per CD-DA sector

# Track starts in seconds (relative to start of audio), placed inside the
# silence gaps found by analysis. Not yet confirmed by ear.
TRACK_STARTS = [0.0, 196.85, 479.07, 673.12, 907.3, 1090.88, 1283.9]


def sector_aligned_frame(seconds):
    frame = int(seconds * 44100)
    return frame - frame % CDDA_SECTOR_FRAMES


def main(iso_path, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    with open(iso_path, 'rb') as f:
        data = f.read(DATA_BYTES)
        audio = f.read()

    with open(os.path.join(out_dir, 'DATA.ISO'), 'wb') as f:
        f.write(data)

    total_frames = len(audio) // FRAME_BYTES
    starts = [sector_aligned_frame(s) for s in TRACK_STARTS] + [total_frames]
    cue = ['FILE "DATA.ISO" BINARY', '  TRACK 01 MODE1/2048', '    INDEX 01 00:00:00']
    for n, (a, b) in enumerate(zip(starts, starts[1:]), start=2):
        name = f'TRACK{n:02d}.WAV'
        with wave.open(os.path.join(out_dir, name), 'wb') as w:
            w.setnchannels(2)
            w.setsampwidth(2)
            w.setframerate(44100)
            w.writeframes(audio[a * FRAME_BYTES:b * FRAME_BYTES])
        cue += [f'FILE "{name}" WAVE', f'  TRACK {n:02d} AUDIO', '    INDEX 01 00:00:00']
        print(f'{name}: {a / 44100:7.2f}s - {b / 44100:7.2f}s ({(b - a) / 44100 / 60:.2f} min)')

    with open(os.path.join(out_dir, 'dplanet.cue'), 'w', newline='\r\n') as f:
        f.write('\n'.join(cue) + '\n')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
