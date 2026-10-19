# Original file formats

All files live in `original_source/Game/` (identical copies in `original_source/CD/DPlanet/`).
Status: ✅ decoded and verified · 🟡 understood, decoder not written · ❓ unknown.

| Ext | Files | Format | Status |
|---|---|---|---|
| `.SND` | `AREA.SND`, `AREA2.SND` | SMIX sound resource (see below) | ✅ |
| `.PIC` | `OMBILD`, `UMBILD`, `HMBILD`, `RASTER` | `"PIC"` + 64000 bytes, Mode X planar | ✅ |
| `.PAL` | `EPIS1`, `UMBILD`, `HMBILD` | 256 × RGB, 6-bit VGA (0–63) | ✅ |
| `.FLI` | intro/ending/story videos | Autodesk Animator FLI, 320×200, 14 fps (`0xAF11`) | ✅ ffmpeg decodes |
| `.LEV` | `LEVEL1..6.LEV` (6200 bytes each) | Tile-index grid | 🟡 |
| `.LIB` | `JETS`, `GEG*`, `SHOTS`, `EXPL`, … | AniVGA sprite library | ❓ |
| `.FNT` | `FIRE`, `SUPER`, `_BROADWA`, `DEFAULT` | AniVGA fonts | ❓ |
| `.TXT/.UNG/.PAS` | `STORY.TXT`, `ANLEIT.UNG`, `ABOUT.TXT`, `MISSIONS.PAS`, `INFO.PAS` | CP437 German text read by the game (**not source code**) | ✅ |
| `SAVE.DAT` | 129 bytes | Save game, has anti-tamper check ("Saveschutz") | ❓ |
| `SETTINGS.DAT` | 5 bytes (`01 02 01 01 03`) | Options (controls P1/P2, CD sound, SFX, …?) | ❓ |

## SMIX sound resource (`.SND`)
Ethan Brodsky's SMIX library format.
```
u16            count
count × {
  char[8]      name      (NUL-padded; may fill all 8 bytes, e.g. "GETBONUS")
  u32          offset    (from file start)
  u32          size
}
raw sample data: 8-bit unsigned mono PCM
```
Sample rate assumed 22050 Hz (SMIX default). **Not yet verified** against the
values DP.EXE passes to the mixer. The garbled SFX in DOSBox are probably an
emulation config/timing issue (Sound Blaster type, cycles), not corrupt data:
the extracted WAVs decode cleanly.

Sound names are listed in DP.EXE in load order (`STDSHOT`, `LASER`, … from
`area.snd`; `BOSS2W1`, … `GOLEM5`, `GLASER` from `area2.snd`).

## PIC
`"PIC"` (3 bytes) + 4 planes × (80 × 200) bytes. Pixel (x, y) is in plane
`x % 4` at index `y * 80 + x // 4`. This is AniVGA's background-page layout.
Decode: `reshape(4, 200, 80).transpose(1, 2, 0).reshape(200, 320)`.

## LEV
From the prototype loader `LevelLaden` in `CD/Wasndas/SLY/SLYVERS.PAS`:
`MomentLevMaxX`, `MomentLevMaxY` (types to be checked; in the prototype probably
1-byte each), then `MaxY × MaxX` tile bytes, row-major (Y outer loop). Tile
graphics come from `TI1.LIB` / `TI2.LIB`. DP.EXE may differ from the prototype.
Verify against DP.EXE before relying on it.

## LIB / COD (AniVGA sprites)
AniVGA V1.2 (Kai Rohrbach) sprite files. A `.COD` is a single sprite, a `.LIB`
is a library of several sprites. The AniVGA distribution documents the format
(sprites stored per Mode X plane, with transparency). The prototype directory
`CD/Wasndas/SLY/` contains small `.COD` files that are good test cases.
Header sample (`JETS.LIB`): `4a01 7c02 ae03 e004 0900 2200 …` followed by `"KR"`
(Kai Rohrbach) signatures per sprite.

## CD soundtrack
See `docs/re-notes.md` → "Soundtrack". Raw 44.1 kHz 16-bit LE stereo PCM
(both channels identical) from byte `75274240` (sector 36755) of
`Image/DPImage.iso` to EOF, about 24 min.
