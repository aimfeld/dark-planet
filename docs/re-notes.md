# Reverse-engineering notes (findings ledger)

Each finding is marked **Observed** (seen directly in bytes or disassembly),
**Inferred** (reasoned from observations) or **Unknown**. REA Evidence IDs
are from the first session (2026-10-19). They are not portable across
sessions, but they identify the analysis that was run.

## Binaries
| File | What | Notes |
|---|---|---|
| `DP.EXE` | Main game, 162656 bytes, 16-bit DOS MZ | **Observed:** Turbo Pascal 7 RTL ("Portions Copyright (c) 1983,92 Borland"), `AniVGA V1.2`, SMIX, XMS/EMS. Unpacked, 2142 relocations, no overlay, header 8608 bytes. Ghidra: 19 segments, 485 procedures (`ev_df2ee920…`). |
| `STARTAUD.EXE` | Starts CD audio via MSCDEX, 9152 bytes | Fully understood, see below. |
| `AAPLAY.EXE` | Autodesk Animator FLI player (1994, third-party) | Plays `INTRO.TXT` / `ENDING.TXT` playlists of FLI files. |
| `CD/autorun.exe` | Windows autorun launcher | Not analysed. |

Source code for DP.EXE is **lost**. Rosetta stones:
- `CD/Wasndas/SLY/SLYVERS.PAS` (Aug 1997): the direct prototype of Dark Planet (tank + ship, shadows, LEV, SMIX FXInit, AniVGA). Same authors.
- `CD/Wasndas/CW2/CW2.PAS` (May 1997): an older game by the same authors.
- The AniVGA and SMIX libraries were published with source. Matching them identifies library routines in DP.EXE.

Turbo Pascal layout tip: the main program segment comes first, units follow,
and the System unit is last. String literals are length-prefixed and stored
in the code segment just before the procedure using them, so Ghidra's string
inventory **misses them**. Find them by file offset instead
(linear address = `0x10000 + file_offset − 8608` for DP.EXE).

## STARTAUD.EXE: fully understood
Main block (`entry` @0x10000, `ev_3b51028c…`):
```pascal
if InitCD then PlayTrack(ParamCount);
```
- **Observed:** `FUN_1162_06eb` = TP7 `ParamCount`. It scans PSP:0x80 and counts words, with DX=0 meaning "count all" (`ev` from instructions of 0x11d0b and 0x11d12).
- So **only the number of arguments matters**: `startaud 1 2 3 4` plays **CD track 4**, and `startaud 1 2 3 4 5 6 7 8 9` plays **CD track 9**.
- `InitCD` (`FUN_1004_0021`, `ev_b04554a4…`): checks MSCDEX (otherwise prints "Konnte MSCDEX nicht finden!" and halts), finds the first CD drive among 0–24, then reads device status and audio disk info.
- `PlayTrack(n)` (`FUN_1004_00db`, `ev_e5af9463…`): if the device supports audio (status bit 0x10), closes the door if needed, and checks lowest ≤ n ≤ highest track. If track n is not a data track, it stops audio and plays from track n's start. **Inferred:** playback runs to the end of the disc (uses disk-info lead-out). There's no looping.

Callers:
- `DPMAX.BAT`: `startaud.exe 1 2 3 4` → track 4 during intro.
- `DP.EXE` **never plays CD audio itself** and never runs `startaud` directly (**Observed:** no `startaud` reference other than the one below; no MSCDEX `mov ax,15xxh`). It **writes a batch file** instead. See "End-of-game batch file" below. `DPMAX.BAT` runs that batch file after `dp.exe` exits.

### End-of-game batch file (session 2, 2026-10-19)
- **Observed** (`ev_a89b0181…`, assembly of 0x1AC74): procedure `WriteEndVideoBat` @0x1AC74 (seg 0x1000, near). It's the procedure right after the literals `endvideo.bat` (0x1AC36), `startaud 1 2 3 4 5 6 7 8 9` (0x1AC43), `aaplay ending.txt` (0x1AC5E) and `kev` (0x1AC70). It calls TP7 `Assign`(3000:13E9) / `Rewrite`(3000:146C) / `Write(str)`(3000:1773) + `WriteLn`(3000:16E0) ×3 / `Close`(3000:14C1), each followed by `IOCheck`(3000:1394). Result:
  ```
  endvideo.bat:
  startaud 1 2 3 4 5 6 7 8 9
  aaplay ending.txt
  kev
  ```
  The string is written unchanged, so the ending **always plays CD track 9**. There is no per-level track selection.
- **Observed:** the only caller is the main-menu loop `FUN_1000_d095` (call at 0x1D371, `ev_ef784bb8…`). After menu item 1 (start game) returns, it calls `WriteEndVideoBat` only if the byte `DS:0x6C53` ≠ 0. **Inferred:** `DS:0x6C53` = "game completed" flag.
- Batch flow (**Observed** in the `.BAT` files): `DPMAX.BAT` = `startaud.exe 1 2 3 4` / `aaplay intro.txt` / `attrib -R` / `dp.exe cd` / `endvideo.bat` / `kev.bat`. A batch file invoked without `CALL` never returns, so if `endvideo.bat` exists it plays track 9 + `ENDING.TXT` (TEST30+TEST29.FLI, 13.4 s) and then runs `kev.bat` (`del endvideo.bat`, `cls`). If it doesn't exist, `DPMAX.BAT` falls through to `kev.bat`.
- **Inferred:** in-game music is simply the CD continuing after the intro. `startaud 4` plays from track 4 to the end of the disc (lead-out), so tracks 4→5→6→7→8→9 play once (≈ 16 min) and then stop. The game never restarts or changes them.

### Main menu loop `FUN_1000_d095` (partial)
- **Observed** (`ev_dfdabd5a…`, pseudocode): a mouse hit-test over 5 rectangles. Mouse x/y are at `DS:0x5516/0x5518`, and the rectangle table at `DS:0x98E + 8·i` holds (x1, y1, x2, y2). The labels are drawn from `DS:0x917 + 0x15·i`. A click (`FUN_272c_011b` ≠ 0) dispatches: 1 → start game (…`FUN_1000_b787`…, then the end-of-game check above), 2 → `FUN_1d9e_84bc`, 3 → toggle `DS:0x25A0` (with a confirmation loop), 4 → `FUN_1000_c4cd`, 5 → quit (`DS:0x3E05` := 1). Hover effects animate `DS:0x316E/0x3170/0x3172` every 5th frame (`DS:0x552E` = frame counter).
- **Unknown:** which menu labels belong to items 2–4 (read the strings at `DS:0x917`, which are initialised data).

## Soundtrack
- **Observed:** `Image/DPImage.iso` (= `.mdf` minus 528 trailing zero bytes, = `.bin` user data) has an ISO 9660 filesystem of 36755 sectors (75274240 bytes). The remaining 254 MB is raw CD-DA PCM: 44.1 kHz, 16-bit LE, stereo with identical channels (only 15 frames differ). It's continuous across 2048-byte sector boundaries, so nothing is missing.
- **Observed:** the `.cue` declares a single MODE1 track, and the `.mds` is DAEMON Tools v2 (encrypted). The image was captured as one data track, which is why emulators saw no audio.
- **Inferred → confirmed by layout:** the original disc had **9 tracks**: data + 8 audio. Track 4 = intro music (`DPMAX.BAT`: `startaud 1 2 3 4`), track 9 = ending (`endvideo.bat`).
- **Method (session 2):** the music is tracker-rendered, so passages within a song repeat **sample-exactly**. Fingerprinting (128-sample windows at per-block peaks, hashed and grouped; scripts were ad hoc in the scratchpad) clusters the audio into songs. Exact repeats never cross a song boundary. Cross-correlation gives nc = 1.000 within a song and < 0.32 across songs.
- **Observed song clusters / track layout** (`tools/build_cd_image.py`, `TRACK_STARTS`, seconds from the start of audio):

  | Track | Start s | Length | Evidence |
  |---|---|---|---|
  | 2 | 0.00 | 3:17 | 3.5 s digital silence at start (pregap); repeats within 0–190 |
  | 3 | 196.85 | 4:42 | 0.42 s zero gap; repeats within 196–478 |
  | 4 | 479.07 | 3:14 | 85 ms zero gap; **intro**: intro video is ≈ 176 s + transitions; repeats 488–542 ↔ 662–670 |
  | 5 | 673.12 | 3:54 | 0.23 s zero gap; repeats within 672–904 |
  | 6 | 907.30 | 3:04 | 1.34 s zero gap; repeats within 906–1085 |
  | 7 | 1090.88 | 3:46 | 84 ms zero gap; repeats within 1091–1316. Pattern period 5.515 s |
  | 8 | 1317.01 | 1:51 | no gap; spectral-novelty peak at 1317.1 s; near-zero runs at 1317.012/1322.573/1328.134 sit on this song's 5.561 s pattern grid (the previous song's grid is 5.515 s); repeats within 1328–1426 |
  | 9 | 1428.23 | 0:14 | novelty peak 1428.3 s, −18 → −27 dB drop, 3.6 ms near-zero run at 1428.238; **ending**: 13.9 s vs. the 13.4 s ending video; reuses intro-track material (1436–1438 ↔ 488–670) |
- **Observed:** the old boundary at 1283.9 s (69 ms zero gap) is **inside** track 7. The audio after it repeats 1194–1216 sample-exactly (nc = 1.000). The old 530 s "loudness jump" candidate is inside the intro track.
- **Observed:** the audio is 1442.14 s. The concatenated WAVs are byte-identical to the PCM in `DPImage.iso`, and `DATA.ISO` is byte-identical to its first 36755 sectors.
- **Observed (DOSBox-X 2024.03.01, headless):** `imgmount` of `fixed/dplanet.cue` reports `GetAudioTracks stTrack=1 end=9`, and `startaud.exe 1 2 3 4 5 6 7 8 9` logs `CDROM: Playing track # 9`.
- Track 8's exact start (1317.01 vs. 1328.1, where a louder section begins) is **inferred** from tempo. It doesn't affect the game, which only requests tracks 4 and 9.

## DOSBox-X reference setup
- `original_source/dplanet.conf`: the user's working config (Steam Deck). SB16 at 220/IRQ7/DMA1/HDMA5, cycles=64000, svga_s3, runs `dpmin.bat` (`dp.exe cd`, no CD audio). `dp.exe cd` appears to bypass the CD check ("Dark Planet sollte durch den Autorun der Original-CD gestartet werden").
- `original_source/dplanet-cd.conf`: the same config, but mounts `Image/fixed/dplanet.cue` as D: and runs `dpmax.bat` (music + intro video). The user confirmed the WAVs play fine. TRACK01 is the data track (`DATA.ISO`). Run from `original_source/Game`.
- DOSBox-X has a built-in debugger (enabled via `debuggerrun = debugger`). Use it for memory diffing (score, lives, entity tables) and for measuring the game's tick rate (timer reprogramming / 0x3DA vsync waits).

## Open questions (gameplay RE)
- Game tick rate / frame timing (vsync-locked 70 Hz? timer-based?).
- Entity tables: enemies, shots, bonuses, shop items/prices (`INFO.PAS` holds the shop texts).
- LEV format as used by DP.EXE, and how enemy waves are scripted (in code, or in data?).
- SFX sample rate passed to SMIX.
- The cheat mentioned in `MISSIONS.PAS` ("Hast du den Cheat schon entdeckt?").
- `SAVE.DAT` and its tamper protection, plus `SETTINGS.DAT` fields.
