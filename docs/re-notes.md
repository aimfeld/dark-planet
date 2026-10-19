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
- `DP.EXE` runs `startaud` only indirectly, at the very end, through `endvideo.bat` (see below). **Correction (later in session 2):** DP.EXE *does* play CD audio itself during the game. It links the same CD unit as STARTAUD (segments 0x2628/0x2643/0x268D/0x26C3), which goes through `Dos.Intr($2F)`, so a byte search for `mov ax,15xxh` misses it. See "CD music in DP.EXE".

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
- ~~In-game music is the CD continuing after the intro~~ (wrong, see "CD music in DP.EXE").

### CD music in DP.EXE (session 2)
- **Observed:** `CDPlay(track)` @0x1DC48 (`FUN_1d9e_0268`, `ev_cdd69d97…`): `if CDAvailable (DS:0x3E20) and CDSoundOption (DS:0x3E1E) then PlayTrack(track)`, and it always stores `DS:0x3E03 := track`. `PlayTrack` = `FUN_2628_00db` @0x2635B and `InitCD` = `FUN_2628_0021` @0x262A1 have the same unit offsets and structure as STARTAUD's `FUN_1004_0021/00db` (`ev_f4ad1fed…`). `InitCD` is called once from `FUN_1000_af0f` (startup).
- **Observed:** `CDRepeat` @0x1DC75 (`FUN_1d9e_0295`, `ev_6b1bb919…`): if CD audio is on, it queries the audio status (`FUN_268d_0254` → `DS:0x3DF2`), and when `DS:0x3DF3` ≠ 0 (inferred: playback finished) it calls `CDPlay(DS:0x3E03)` again. So **every track loops**. Polled by the main-menu loop (every frame), the game loop (every 40 frames, `DS:0x552E mod 40`), the pause loop, and the text viewer `FUN_1000_c7f2`.
- **Observed:** `CDPlay` call sites and their arguments (byte scan for `call 0D9E:0268` / near `call 0268`):

  | Call site | Track | Context |
  |---|---|---|
  | 0x1D628 in `DrawMainMenu` 0x1D60E | 2 | main menu (`hmbild.pic/pal`) |
  | 0x1D386 in game menu 0x1D095 | 2 | back in the menu after a game |
  | 0x1C62F in `Options` 0x1C4CD | 2 | when CDSound is switched on (`DS:0x3E1E := 1`) |
  | 0x1D90D in main body | 3 | main-menu item 3 "Story" (`story.txt` over `raster.pic`) |
  | 0x1B5B3 in `StartLevel` 0x1B582 | `LevelTrack[level]` | byte table at DS:0x1032 indexed by `DS:0x15E6` (level 1–7): **5, 6, 7, 5, 6, 7, 7** |
  | 0x1629B in `StartBossFight` 0x1627E | 8 | boss music; the procedure then spawns level-specific boss parts (`FUN_1000_163a`, per `DS:0x15E6` = 1…6) |
  | 0x1DCA7 in `CDRepeat` | current | loop |
  | (STARTAUD via `DPMAX.BAT`) | 4 | intro video |
  | (STARTAUD via `endvideo.bat`) | 9 | ending video |

  Tracks 2 and 3 *are* used (menu and story). Every track on the disc has a role.

### Program structure (session 2)
**Unit/segment map** (Ghidra segment = linear/16, which is file segment + 0x1000; sizes in bytes). Unit init order observed in the main body: System → Crt → AniVGA → SMIX → CD core (units without an init section are skipped). That matches TP7's "higher segment = initialised earlier".

| Seg | Size | Procs | Unit | Evidence |
|---|---|---|---|---|
| 0x1000 | 0xD9E0 | 77 | main program (`DP.PAS`) | MZ entry CS:IP = 0000:D769 → linear 0x1D769 |
| 0x1D9E | 0x88A0 | 101 | game unit (support code) | keyboard ISR (`in 60h`, EOI `out 20h`), `CDPlay`, `PlaySound`, … |
| 0x2628 | 0x1B0 | 3 | CD high level: `InitCD`, `PlayTrack` | "Konnte MSCDEX nicht finden!", same offsets as STARTAUD |
| 0x2643 | 0x4A0 | 3 | CD core (has init 0x048A) | 78 % of 12-byte chunks also occur in STARTAUD.EXE |
| 0x268D | 0x360 | 13 | MSCDEX device requests | calls 0x26C3; 56 % shared with STARTAUD |
| 0x26C3 | 0x5C0 | 14 | MSCDEX low level | `Dos.Intr($2F, regs)` ×6 |
| 0x271F | 0xD0 | 2 | joystick | `Dos.Intr($15)` (BIOS joystick) |
| 0x272C | 0x160 | 6 | mouse (prototype's `MOUSE2`) | `Dos.Intr($33)` ×6; `FUN_272c_011b` = button state (used as "clicked") |
| 0x2742 | 0x270 | 3 | SMIX `Detect` | string "BLASTER" at 0x275AF |
| 0x2769 | 0x14D0 | 43 | SMIX | 34 port in/out (SB DSP); `XMSInstalled` (int 2Fh AX=4300h) at 2769:14C0; `StartSound` = 2769:09DC (inferred; called by `PlaySound`), `SoundPlaying` = 0AB9 / `StopSound` = 0A75 (inferred from usage), 076B ×59 = probably `LoadSound` |
| 0x28B6 | 0x80 | 5 | XMS | int 2Fh AX=4310h (XMS driver entry) |
| 0x28BE | 0x6E20 | 57 | AniVGA 1.2 | ports 3C4h/3CEh (Mode X planes), 3C8h, 3D4h; "AniVGA V1.2" and "PICF" in DS; init 6E17 |
| 0x2FA0 | 0xC70 | 14 | buffered file reader | `0BF3` = byte-wise BlockRead into a huge pointer; called by main + AniVGA |
| 0x3067 | 0x1F0 | 9 | TP `Dos` (smart-linked) | FindFirst/FindNext (4Eh/4Fh), Get/SetIntVec (35h/25h), `MsDos` = 0179, `Intr` = 0184 (patches an `int` opcode) |
| 0x3086 | 0x640 | 21 | TP `Crt` | int 16h (KeyPressed/ReadKey), Ctrl-Break vector, PIT ch2 (`Sound`); `Delay` = 3086:02C2 (inferred from usage `Delay(15)`, `Delay(1200)`) |
| 0x30EA | 0x1A30 | 111 | TP `System` RTL | "Runtime error … Portions Copyright (c) 1983,92 Borland" |
| 0x328D | 0x30F0 | – | DS (initialised data, typed constants); BSS continues at 0x359C0 | menu strings, `LevelTrack` table |

System RTL entry points seen so far (offsets in seg 0x30EA): `0000` init, `0530` stack check (prologue of most procedures), `04F4` IOCheck, `04ED` IOResult (inferred), `08D3` Write(string), `0840` WriteLn, `13E9` Assign, `146C` Rewrite, `14C1` Close, `1773` Write(text, string), `16E0` WriteLn(text), `0116` Halt/exit path (inferred).

**Main program body** @0x1D769 (`ev_f9428fd7…`): unit inits → ClrScr (inferred) → `Write('Loading...')` → `FUN_1000_af0f` (startup: InitCD, XMS, sounds, sprites, settings, judging by the nearby literals "XMS initialisieren...", "Sounds laden...", "Sprites laden...", "Gamesettings laden...") → `FUN_271f_007e` (joystick) → `1d9e:0000` (game-unit setup) → `DrawMainMenu` 0x1D60E → main-menu loop until quit, then shutdown `FUN_1d9e_3a15`.
- **Main menu loop** (in the body): selection `DS:0x30EE` ∈ 1..6 moved by up/down flags `DS:0x6C2A/0x6C2B` (wraps), confirmed by `DS:0x6C2C`/`0x6C2F`, quit by `DS:0x6C30` (Esc, inferred). Items: **1 new game** (`DS:0x25A0` := 0, level `DS:0x15E6` := 1, → game menu 0x1D095), **2 load game** (`FUN_1d9e_05d9`, → game menu on success), **3 Story** (CD track 3, `story.txt`), **4 Anleitung** (`anleit.ung`), **5 About** (`about.txt`), **6 quit**. 3–5 use the text viewer `FUN_1000_c7f2(file, …)`. `Delay(15)` per iteration.
- **Game menu** @0x1D095 (`ev_dfdabd5a…`): mouse hit-test over 5 rectangles (table `DS:0x98E`, labels `DS:0x917 + 0x15·i`): **1 "Shoot em all"** → `StartLevel` 0x1B582 (CD track per level) → `FUN_1000_07f8` → **game loop** 0x1B787 → if `DS:0x6C53` (game completed) then `WriteEndVideoBat`; **2 "Shop"** → `FUN_1d9e_84bc`; **3 "Multiplayer"** → toggle player 2 (`DS:0x25A0`, "Verstärkung? Enter=Ja", "Zurückschalten nicht möglich!"); **4 "Optionen"** → `FUN_1000_c4cd` (control setup Tastatur/Joystick per player, "CDSound:", "SoundEffekte:"); **5 "Zurück zu Hauptmenu"**. Episode = `DS:0x15E7` = (level−1) div 3 + 1.
- **Game loop** @0x1B787 (`ev_243f3ace…`), one iteration per frame: `CDRepeat` every 40 frames; IOResult check; per active player (`DS:0x15E1` / `0x15E2`) input by control type `DS:0x259E/0x259F` (1/2/3 → `FUN_1000_a1dd`/`a34b`/`a58f`; input flags at `DS:0x6C3B…0x6C45` for P1 and `0x6C46…0x6C50` for P2), movement `a73e`; timers; collisions/energy (`0fa3`, `0d24`, `0742`, `0f30`); weapons (`961c`, `3c37`, `3534`, `330c`); enemies/scripting (`6c0e`, `93cd`, `5671`, `6653`); `FUN_28be_2cef` (AniVGA `Animate`, inferred: sprite draw + page flip); pause (`DS:0x4440`); exits when level done `DS:0x6C52`, game over countdown `DS:0x6C66` (sound 0x2A at 110), or abort `DS:0x6C51` (Esc). Then `FUN_1000_b6d1`.
- `PlaySound(?, n)` @1d9e:4173: if `DS:0x3E1D` (sound available) and `DS:0x3E1F` (SoundEffekte option) then SMIX `StartSound`.
- `DS:0x25B4/0x25B6`: background scroll X/Y (inferred; used by AniVGA tile code at 28be:5443 with 40-column rows and by boss spawning as "scroll Y + offset").
- **Frame timing: Unknown.** PIT channel 0 is never reprogrammed (the only PIT `out` is Crt's channel-2 `Sound`), and AniVGA reads the BIOS tick counter at 28be:5449. The pacing (vertical retrace in `Animate` vs. tick-based) needs DOSBox-X measurement.

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
- **Roles** (from DP.EXE, see "CD music in DP.EXE"): 2 = menus, 3 = story screen, 4 = intro video, 5/6/7 = levels 1+4 / 2+5 / 3+6(+7), 8 = boss fights, 9 = ending video. DP.EXE loops tracks via `CDRepeat`.
- Track 8's exact start (1317.01 vs. 1328.1, where a louder section begins) is **inferred** from tempo. An earlier start only adds about 11 s to the boss music.

## DOSBox-X reference setup
- `original_source/dplanet.conf`: the user's working config (Steam Deck). SB16 at 220/IRQ7/DMA1/HDMA5, cycles=64000, svga_s3, runs `dpmin.bat` (`dp.exe cd`, no CD audio). `dp.exe cd` appears to bypass the CD check ("Dark Planet sollte durch den Autorun der Original-CD gestartet werden").
- `original_source/dplanet-cd.conf`: the same config, but mounts `Image/fixed/dplanet.cue` as D: and runs `dpmax.bat` (music + intro video). The user confirmed the WAVs play fine. TRACK01 is the data track (`DATA.ISO`). Run from `original_source/Game`.
- DOSBox-X has a built-in debugger (enabled via `debuggerrun = debugger`). Use it for memory diffing (score, lives, entity tables) and for measuring the game's tick rate (timer reprogramming / 0x3DA vsync waits).

## Open questions (gameplay RE)
- Game tick rate / frame timing (vsync-locked 70 Hz? timer-based?). PIT ch0 is not reprogrammed. Measure in DOSBox-X: count game-loop iterations (`DS:0x552E`) per second.
- Entity tables: enemies, shots, bonuses, shop items/prices (`INFO.PAS` holds the shop texts).
- LEV format as used by DP.EXE, and how enemy waves are scripted (in code, or in data?).
- SFX sample rate passed to SMIX.
- The cheat mentioned in `MISSIONS.PAS` ("Hast du den Cheat schon entdeckt?").
- `SAVE.DAT` and its tamper protection, plus `SETTINGS.DAT` fields.
