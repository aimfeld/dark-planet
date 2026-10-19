"""Readers for the AniVGA 1.2 graphics formats used by Dark Planet.

Format notes live in docs/file-formats.md; the loader evidence (DP.EXE
addresses) is in docs/re-notes.md.
"""
import struct
from dataclasses import dataclass

import numpy as np

HEADER_SIZE = 50  # DP.EXE LoadLib @0x137A0 reads 0x32 bytes, then checks 'KR' at +38
EMPTY_TOP, EMPTY_BOTTOM = 16000, -16000  # boundary values of a fully transparent column


@dataclass
class Sprite:
    pixels: np.ndarray  # (height, width) uint8 palette indices, 0 = transparent
    left: list          # per row: first opaque x (or EMPTY_TOP when the row is empty)
    right: list         # per row: last opaque x (or EMPTY_BOTTOM)
    top: list           # per column: first opaque y (or EMPTY_TOP)
    bottom: list        # per column: last opaque y (or EMPTY_BOTTOM)

    @property
    def width(self):
        return self.pixels.shape[1]

    @property
    def height(self):
        return self.pixels.shape[0]


def read_palette(path):
    """768 bytes of 6-bit VGA RGB -> (256, 3) uint8."""
    raw = np.frombuffer(open(path, 'rb').read(), np.uint8).reshape(256, 3)
    return (raw.astype(int) * 255 // 63).astype(np.uint8)


def parse_sprite(data, offset=0):
    """One AniVGA sprite record at data[offset:]. Returns (Sprite, record length).

    Header (all offsets relative to the record start, words little-endian):
      0   4 x u16  plane pointers (data for screen x mod 4 = 0..3)
      8   u16      width in bytes per plane (pixel width = 4 x this)
      10  u16      height in rows
      12  4 x u8   plane masks 01 02 04 08
      16  u16      record length (header + tables + pixels)
      18  20 bytes unused (zero)
      38  'KR'     signature (Kai Rohrbach)
      40  u8, u8   version 1, mode 0
      42  4 x u16  pointers to the left/right (per row) and top/bottom (per column) boundary tables
    Plane p holds height rows of `width` bytes; byte (row, col) is pixel x = 4 * col + p.
    """
    planes = struct.unpack_from('<4H', data, offset)
    wbytes, height = struct.unpack_from('<2H', data, offset + 8)
    length = struct.unpack_from('<H', data, offset + 16)[0]
    assert data[offset + 38:offset + 40] == b'KR', f'no KR signature at {offset}'
    p_left, p_right, p_top, p_bottom = struct.unpack_from('<4H', data, offset + 42)
    width = 4 * wbytes
    pixels = np.zeros((height, width), np.uint8)
    for p, ptr in enumerate(planes):
        plane = np.frombuffer(data, np.uint8, wbytes * height, offset + ptr)
        pixels[:, p::4] = plane.reshape(height, wbytes)

    def table(ptr, n):
        return list(struct.unpack_from(f'<{n}h', data, offset + ptr))

    sprite = Sprite(pixels, table(p_left, height), table(p_right, height),
                    table(p_top, width), table(p_bottom, width))
    return sprite, length


def read_sprite_lib(path):
    """A .LIB is a plain concatenation of sprite records (a .COD is a single one)."""
    data = open(path, 'rb').read()
    sprites, offset = [], 0
    while offset < len(data):
        sprite, length = parse_sprite(data, offset)
        sprites.append(sprite)
        offset += length
    assert offset == len(data), f'{path}: trailing bytes'
    return sprites


def boundaries_from_pixels(pixels):
    """Recompute the boundary tables from the opacity mask (for checking the stored ones)."""
    mask = pixels != 0
    h, w = mask.shape
    left = [int(np.argmax(r)) if r.any() else EMPTY_TOP for r in mask]
    right = [int(w - 1 - np.argmax(r[::-1])) if r.any() else EMPTY_BOTTOM for r in mask]
    top = [int(np.argmax(c)) if c.any() else EMPTY_TOP for c in mask.T]
    bottom = [int(h - 1 - np.argmax(c[::-1])) if c.any() else EMPTY_BOTTOM for c in mask.T]
    return left, right, top, bottom


@dataclass
class Font:
    width: int          # cell width in pixels
    height: int         # cell height in pixels
    multicolor: bool    # True: one palette index per pixel; False: 1 bit per pixel
    glyphs: np.ndarray  # (256, height, width) uint8: palette indices, or 0/1 for mono
    widths: list        # per character advance width (the cell width unless proportional)


def read_font(path):
    """AniVGA LoadFont (DP.EXE @0x2A7AD): 'FNT', u8 width (<=15), u8 height (<=16), u8 type.

    type bit 7: proportional, a 256-byte width table follows the glyphs.
    type & 0x7F: 0 = monochrome, rows of ceil(width / 8) bytes read as a little-endian
                     word; pixel x is bit (width - 1 - x) (text renderer @0x2AF3C, bit
                     table DS:0x28F0), so a 6-wide glyph uses bits 5..0;
                 1 = multicolour, rows of `width` bytes (palette index, 0 = transparent).
    The loader rejects files whose size isn't 6 + glyph bytes (+ 256 if proportional).
    """
    data = open(path, 'rb').read()
    assert data[:3] == b'FNT', path
    width, height, kind = data[3], data[4], data[5]
    proportional, mode = bool(kind & 0x80), kind & 0x7F
    assert mode in (0, 1) and width <= 15 and height <= 16, (path, width, height, kind)
    row_bytes = width if mode else (width + 7) // 8
    size = 256 * height * row_bytes
    assert len(data) == 6 + size + (256 if proportional else 0), path
    raw = np.frombuffer(data, np.uint8, size, 6).reshape(256, height, row_bytes)
    if mode:
        glyphs = raw.copy()
    else:
        rows = sum(raw[..., i].astype(np.uint32) << (8 * i) for i in range(row_bytes))
        bits = width - 1 - np.arange(width)
        glyphs = ((rows[..., None] >> bits) & 1).astype(np.uint8)
    widths = list(data[6 + size:]) if proportional else [width] * 256
    return Font(width, height, bool(mode), glyphs, widths)
