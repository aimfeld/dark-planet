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
- `DP.EXE`: contains the string `startaud 1 2 3 4 5 6 7 8 9` at file offset 52708. Its length byte (26) is at 52707, which is **linear 0x1AC43 / string 0x1AC44**. **Unknown:** whether DP.EXE runs it unchanged (always track 9) or shortens the string per level/context (e.g. `Copy`/length-byte tricks give tracks 1–9). The neighbouring literals `endvideo.bat`, `startaud 1 2 3 4 5 6 7 8 9` and `aaplay ending.txt` span linear 0x1AC36–0x1AC70. **Next step:** decompile the procedure that follows them (starting ≥ 0x1AC70) and find the `Exec`/`SwapVectors` calls that reference these addresses.

## Soundtrack
- **Observed:** `Image/DPImage.iso` (= `.mdf` minus 528 trailing zero bytes, = `.bin` user data) has an ISO 9660 filesystem of 36755 sectors (75274240 bytes). The remaining 254 MB is raw CD-DA PCM: 44.1 kHz, 16-bit LE, stereo with identical channels (only 15 frames differ). It's continuous across 2048-byte sector boundaries, so nothing is missing.
- **Observed:** the `.cue` declares a single MODE1 track, and the `.mds` is DAEMON Tools v2 (encrypted). The image was captured as one data track, which is why emulators saw no audio.
- **Inferred:** the original disc had **≥ 9 tracks** (data + ≥ 8 audio), because DP.EXE requests track 9.
- Silence-based split (in `tools/build_cd_image.py`, `TRACK_STARTS`) gives only 7 audio tracks (2–8). Boundaries at 0, 196.85, 479.07, 673.12, 907.3, 1090.88 and 1283.9 s; the 906 s gap (1.3 s of silence) is the most certain. **At least one more boundary is missing.** The strongest non-silent candidate is a loudness jump at **8:50 (530 s)**. Other spectral-change candidates: 9:43, 10:36, 15:51, 18:05, 20:17, 22:06, 23:48. **Needs the user's ear.**
- Once the boundaries are right, `tools/build_cd_image.py` → `original_source/Image/fixed/` and `original_source/dplanet-cd.conf` mount it in DOSBox-X.

## DOSBox-X reference setup
- `original_source/dplanet.conf`: the user's working config (Steam Deck). SB16 at 220/IRQ7/DMA1/HDMA5, cycles=64000, svga_s3, runs `dpmin.bat` (`dp.exe cd`, no CD audio). `dp.exe cd` appears to bypass the CD check ("Dark Planet sollte durch den Autorun der Original-CD gestartet werden").
- `original_source/dplanet-cd.conf`: the same config, but mounts `Image/fixed/dplanet.cue` as D: and runs `dpmax.bat` (music + intro video). **Not yet tested.** Run from `original_source/Game`.
- DOSBox-X has a built-in debugger (enabled via `debuggerrun = debugger`). Use it for memory diffing (score, lives, entity tables) and for measuring the game's tick rate (timer reprogramming / 0x3DA vsync waits).

## Open questions (gameplay RE)
- Game tick rate / frame timing (vsync-locked 70 Hz? timer-based?).
- Entity tables: enemies, shots, bonuses, shop items/prices (`INFO.PAS` holds the shop texts).
- LEV format as used by DP.EXE, and how enemy waves are scripted (in code, or in data?).
- SFX sample rate passed to SMIX.
- The cheat mentioned in `MISSIONS.PAS` ("Hast du den Cheat schon entdeckt?").
- `SAVE.DAT` and its tamper protection, plus `SETTINGS.DAT` fields.
