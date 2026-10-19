# Original file formats

All files live in `original_source/Game/` (identical copies in `original_source/CD/DPlanet/`).
Status: ✅ decoded and verified · 🟡 understood, decoder not written · ❓ unknown.

| Ext | Files | Format | Status |
|---|---|---|---|
| `.SND` | `AREA.SND`, `AREA2.SND` | SMIX sound resource, signed 8-bit 11025 Hz (see below) | ✅ |
| `.PIC` | `OMBILD`, `UMBILD`, `HMBILD`, `RASTER` | `"PIC"` + 64000 bytes, Mode X planar | ✅ |
| `.PAL` | `EPIS1`, `UMBILD`, `HMBILD` | 256 × RGB, 6-bit VGA (0–63) | ✅ |
| `.FLI` | intro/ending/story videos | Autodesk Animator FLI, 320×200, 14 fps (`0xAF11`) | ✅ ffmpeg decodes |
| `.LEV` | `LEVEL1..6.LEV` (6200 bytes each) | 10×200 tile grid + 600 spawn records | ✅ `tools/render_levels.py` |
| `.LIB` | `JETS`, `GEG*`, `SHOTS`, `EXPL`, … , `TI1`, `TI2` | AniVGA sprites, concatenated | ✅ `tools/extract_sprites.py` |
| `.FNT` | `FIRE`, `SUPER`, `_BROADWA`, `DEFAULT` | AniVGA fonts | ✅ `tools/extract_fonts.py` |
| `.TXT/.UNG/.PAS` | `STORY.TXT`, `ANLEIT.UNG`, `ABOUT.TXT`, `MISSIONS.PAS`, `INFO.PAS` | CP437 German text read by the game (**not source code**) | ✅ |
| `SAVE.DAT` | 129 bytes | Save game with a checksum ("Saveschutz"), see below | 🟡 (verified on the sample) |
| `SETTINGS.DAT` | 5 bytes (`01 02 01 01 03`) | Options: controls P1/P2, CD sound, SFX, CPU delay, see below | 🟡 |

## SMIX sound resource (`.SND`)
Ethan Brodsky's SMIX library format.
```
u16            count
count × {
  char[8]      name      (NUL-padded; may fill all 8 bytes, e.g. "GETBONUS")
  u32          offset    (from file start)
  u32          size
}
raw sample data: 8-bit **signed** mono PCM, 11025 Hz
```
Verified in DP.EXE (session 3): SMIX programs the DSP for 11025 Hz (SB16
command 0x41 with 0x2B11, else time constant 0x40 from 11025; @0x27A3D), and
the mixer sign-extends each sample byte (`cbw`, @0x288EB). Silence is 0x00.
WAV 8-bit is unsigned, so the extractor XORs each byte with 0x80. Earlier
versions wrote the bytes unchanged at 22050 Hz, which sounded garbled.

Sound names are listed in DP.EXE in load order (`STDSHOT`, `LASER`, … from
`area.snd`; `BOSS2W1`, … `GOLEM5`, `GLASER` from `area2.snd`).

## PIC
`"PIC"` (3 bytes) + 4 planes × (80 × 200) bytes. Pixel (x, y) is in plane
`x % 4` at index `y * 80 + x // 4`. This is AniVGA's background-page layout.
Decode: `reshape(4, 200, 80).transpose(1, 2, 0).reshape(200, 320)`.

## LEV
No header (unlike the prototype). Read by `LoadLevel` @0x1B3ED (see re-notes "Levels").
```
200 rows × 10 bytes   tile numbers (1-based index into the episode's TIn.LIB),
                      first row = start of the level (bottom of the map)
600 × 7 bytes         spawn records (copied to DS:0x4442):
  i16  y      fire when the scroll Y (level y at the screen top) equals this;
              the scroll starts at 0 and decreases; 100 = empty slot
  i16  x      screen x (0..~300) of the sprite's left edge
  u8   type   enemy/object type 0..0x4A; boss triggers 05, 20, 23, 3C, 43, 48
  u8   sub    behaviour/variant, passed to SpawnEnemy
  u8   flag   fires only if flag ≤ DS:0x16C2, a constant 1; every used record has 1
              (0 only in empty slots), so in practice every record fires
```
Level coordinates: tile row r (1-based) covers y = 168 − 32·(r−1) … +31, column c
covers x = 32·(c−1) … +31, so the level spans y = −6200 … 199 (320 × 6400 px).
Tileset: `TI1.LIB` for levels 1–3, `TI2.LIB` for 4–6 (episode = (level−1) div 3 + 1).

## LIB / COD (AniVGA sprites)
AniVGA V1.2 (Kai Rohrbach) sprites. A `.COD` is one sprite record; a `.LIB` is
records concatenated back to back (no library header). DP.EXE's `LoadLib`
@0x137A0 reads them in order and numbers them from a base number per file
(see `SPRITE_LIBS` in `tools/extract_sprites.py`).
```
record (offsets from its start, little-endian):
  0   4 × u16  offset of the pixel data for plane 0..3
  8   u16      width in bytes per plane (pixel width = 4 × this)
  10  u16      height
  12  4 × u8   plane masks 01 02 04 08
  16  u16      record length (header + tables + pixels)
  18  20 bytes zero
  38  "KR"     signature (checked by the loader)
  40  u8 1, u8 0  version, mode
  42  4 × u16  offsets of the boundary tables: left[height], right[height],
               top[width], bottom[width] (i16; empty row/column = 16000 / −16000)
  50  tables, then pixel data
pixels: plane p = height rows × (width bytes); byte (row, col) is pixel
        x = 4·col + p. Palette index, 0 = transparent.
```
Verified: for all 1317 sprites of the game (tiles included) and the 48 of the prototype, the stored
boundary tables equal the first/last opaque pixel per row and column of the
decoded image. AniVGA 1.2 sprites have no hotspot; positions are the top-left corner.
`TI1.LIB`/`TI2.LIB` use the same records (all 32×32). AniVGA `LoadTile`
@0x2D7DA cuts each record into 16×16 tiles row by row (width must be a multiple
of 16, height too; at most 256 tiles), so TI sprite t becomes tiles 4t−3 … 4t.

## FNT (AniVGA fonts)
Read by AniVGA `LoadFont` @0x2A7AD:
```
"FNT", u8 width (≤ 15), u8 height (≤ 16), u8 type
type & 0x7F = 0: monochrome, 256 chars × height rows × ceil(width/8) bytes;
                 each row is a little-endian word, pixel x = bit (width−1−x)
                 (renderer @0x2AF3C, bit table DS:0x28F0)
type & 0x7F = 1: multicolour, 256 × height × width bytes (palette index, 0 = clear)
type & 0x80:     proportional, 256 advance widths follow the glyphs
```
The loader rejects files whose size doesn't match. `DEFAULT` 6×6 mono,
`SUPER` 8×8 mono, `_BROADWA` 9×16 mono (column 0 always empty), `FIRE` 13×16
multicolour proportional (red gradient, colours 0xF0–0xFF and 0x1A).

## SETTINGS.DAT
Written when leaving the Options screen (@0x1AA85: Assign/Rewrite(f, 1)/5 × BlockWrite 1 byte), read at startup
(@0x1AB37). Byte order = the Options lines.
```
0  u8  P1 control   1 keyboard, 2 mouse, 3 joystick
1  u8  P2 control   same values; the Options screen never lets it equal P1's
2  u8  CD sound     0/1 (can only be switched on if a CD drive was found)
3  u8  SFX          0/1 (only on if a sound card was found)
4  u8  CPU          1 "486", 2 "Pentium", 3 "Pentium II", 4 "Cray"
                    -> Crt.Delay(6 / 9 / 12 / 16 ms) every game frame (@0x1AA36)
```
Sample `01 02 01 01 03`: P1 keyboard, P2 mouse, CD on, SFX on, Pentium II. Without the file the defaults are
P1 = 1, P2 = 2, CD/SFX = hardware detected, and CPU = 0 (no delay; not defaulted).

## SAVE.DAT
One save slot, written only when the "Save" bonus is bought in the shop (1d9e:0350 @0x1DD30), read by
"load game" (1d9e:05D9 @0x1DFB9). Little-endian, 129 bytes.
```
0    i32  checksum
4    u8   two-player flag (DS:0x25A0)
5    u8   P1 active
6    u8   P2 active
7    u8   level 1..6 (the level about to be played)
8    u8   episode (level-1) div 3 + 1
9    P1 block, 60 bytes:
     +0   i16  lives (spare ships)
     +2   i32  money
     +6   u8   jet 1..5
     +7   8 x 6 bytes mounts: i16 reload counter, u8 loaded, u8 occupied, u8 item id, u8 category
               (index 0 large nose, 1 small, 2 standard weapon, 3-6 large, 7 ball pod)
     +55  u8   engine 0..3
     +56  u8   shield 0..3
     +57  3 x u8 bonus item ids (0 = empty)
69   P2 block, same layout (a never-joined P2 has lives 5, engine/shield 0)
```
Checksum (1d9e:02CC): 16-bit sum, sign-extended to i32, of level + episode + lives + low word of money + jet +
engine + shield of P1 and the same five fields of P2. Mounts and bonuses are not covered. On a mismatch the game
prints "Na du kleines Schlitzohr, so läuft das aber nicht! …Saveschutz…" and exits. The sample file
(level 2, one player, 6 lives, 600 money, Duallaser) stores 618, which matches the computed sum.

## CD soundtrack
See `docs/re-notes.md` → "Soundtrack". Raw 44.1 kHz 16-bit LE stereo PCM
(both channels identical) from byte `75274240` (sector 36755) of
`Image/DPImage.iso` to EOF, about 24 min.
