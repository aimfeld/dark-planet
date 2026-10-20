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
- **Game loop** @0x1B787 (`ev_243f3ace…`), one iteration per frame: `CDRepeat` every 40 frames; IOResult check; per active player (`DS:0x15E1` / `0x15E2`) input by control type `DS:0x259E/0x259F` (1 keyboard / 2 mouse / 3 joystick → `FUN_1000_a1dd`/`a34b`/`a58f`; input flags at `DS:0x6C3B…0x6C45` for P1 and `0x6C46…0x6C50` for P2), movement `a73e`; timers; death/respawn/shield (`0fa3`, `0d24`, `0742`, `0f30`); weapons (`961c`, `3c37`, `3534`, `330c`); enemies/scripting (`6c0e`, `93cd`, `5671`, `6653`); all named in "Gameplay (session 4)"; `FUN_28be_2cef` (AniVGA `Animate`, inferred: sprite draw + page flip); pause (`DS:0x4440`); exits when level done `DS:0x6C52`, game over countdown `DS:0x6C66` (sound 0x2A at 110), or abort `DS:0x6C51` (Esc). Then `FUN_1000_b6d1`.
- `PlaySound(?, n)` @1d9e:4173: if `DS:0x3E1D` (sound available) and `DS:0x3E1F` (SoundEffekte option) then SMIX `StartSound`.
- `DS:0x25B4/0x25B6`: background scroll X/Y (inferred; used by AniVGA tile code at 28be:5443 with 40-column rows and by boss spawning as "scroll Y + offset").
- **Frame timing (session 3, corrected in session 4): no frame limiter, but a fixed per-frame `Delay` set by the Options "CPU" line; the rest of the frame time depends on the CPU.**
  - **Observed (session 4):** `FUN_1000_aa36` @0x1AA36, called once per game-loop frame, does Crt `Delay(6 / 9 / 12 / 16 ms)` (`lcall 2086:02C2`) for CPU setting `DS:0x3E04` = 1 "486" / 2 "Pentium" / 3 "Pentium II" / 4 "Cray" (0 = no delay, the value without SETTINGS.DAT). Crt.Delay is a calibrated busy loop, so a frame = game work + that delay. The sample SETTINGS.DAT has CPU = 3 (12 ms), so the ≈ 24 ms frames measured below are roughly half work, half delay. The session-3 statement "not throttled" was wrong in that respect; the 40 Hz decision is unaffected.
  - **Observed:** AniVGA's frame limiter is `SetCycleTime(ms)` @0x296AD (`28be:0ACD`): interval = ms × 1000 µs via BIOS INT 15h AH=83h (event wait, flag `DS:0xFCB9`), enabled only if ms ≠ 0 and the BIOS model byte F000:FFFE = 0xFC. The page flip @0x2D70C waits for that flag and re-arms it. AniVGA init (@0x2F5B1) and the game's startup (@0x1B012, after the memory check in `FUN_1000_af0f`) both call `SetCycleTime(0)`, and nothing else does. So the limiter is **off**.
  - **Observed:** the flip waits only for a display-enable edge (`DS:0xFCC0` status port bit 0, @0x2D711), not for vertical retrace. The only bit-3 (vertical retrace) wait is in the palette setter @0x28E21. In the game loop, `Delay(500)` runs when pausing (`DS:0x4440`, @0x1BFE0), and the per-frame CPU delay of `0x1AA36` (session 4, above) is the only other wait. There are no BIOS-tick waits in the game loop.
  - **Observed:** `ScrollStep` @0x15F68 runs once per loop iteration (call at 0x1BF30). If `DS:0x15E0` (scrolling on) is set, it decrements scroll Y `DS:0x25B6` by **1 px** and moves both players' `SpriteY` with it. So frames/s = scroll px/s, and a level (6200 px) lasts 6200 / fps seconds of scrolling.
  - **Inferred:** in DOSBox-X the speed is set by `cycles` (64000 in `dplanet.conf`, which the user says feels right). In 1998 it depended on the player's PC. The remake needs a fixed tick rate that matches the reference feel.
  - **Observed (session 3, DOSBox-X capture `original_source/capture/dp_002.avi`, cycles=64000, level 1, `tools/measure_scroll.py`):** the background moves 0 or 1 px per 70.086 Hz VGA refresh, **40.9 px/s on average ≈ 41 game frames/s**. 10-second windows range from 37 to 46 px/s (CPU-bound, so busier scenes run slower). Scrolling ran for 5542 px in 135.4 s and then stopped at the boss arena. That matches level 1's boss record (`y = −5561`) to within the few frames lost at the edges, which confirms 1 px per frame over a whole level. **Remake: a fixed 40 Hz tick** (confirmed by the user).

### Asset loading (session 3)
Evidence IDs: `ev_dc9ad07c…` (LoadLib instructions), `ev_35c25285…` (LoadTile pseudocode),
`ev_f50427d8…` (SpawnEnemy pseudocode). Other addresses come from `objdump` of the segments.
- **Observed:** `LoadLib(name, base)` @0x137A0 (main program, near; the game's own loader, not AniVGA's `LoadSprite`). It reads a 50-byte header, checks `"KR"` at +38, allocates `length + 15` (paragraph-aligned), copies the header and reads `length − 50` more bytes, then registers the sprite through AniVGA (`2000:0630`, `2000:047D`) as number `base + i`, until EOF. The caller @0x13B84 loads, in order: `jets` 1, `pods` 43, `shots` 146, `expl` 293, `boni` 393, `anzeigen` 490, `shop` 493, `rest` 544, `geg1` 850, `aschen1` 1000, `geg2` 1024, `geg21` 1165, `geg22` 1243, `aschen2` 1355. The sprite counts fill these ranges exactly (REST ends at 678, so 679–849 are unused).
- **Observed:** sprite pixel layout (4 planes, `pixel x = 4·col + plane`, 0 = transparent) is confirmed by the boundary tables in every record, which equal the opaque extents of the decoded image (all 1317 game sprites).
- **Observed:** AniVGA `LoadTile(name, first)` @0x2D7DA (`28be:4bfa`): sprite records whose width and height are multiples of 16, cut into 16×16 tiles row by row, numbered from `first`, at most 256. Returns the tile count (stored in `DS:0x5520`).
- **Observed:** AniVGA `LoadFont` @0x2A7AD: `"FNT"` (compared with `DS:0x2F2E`), width, height, type; bit 7 = proportional (width table at `DS:0xB0D8`), low bits 0 = mono / 1 = multicolour; mono rows are read as words (`ceil(w/8)` bytes) and the renderer @0x2AF3C tests bit `width−1−x` via the table at `DS:0x28F0` (`4000h >> i`). AniVGA's built-in default font is 6×6 mono (@0x2A6BD).
- **Observed:** palette: only `EPIS1.PAL` exists for gameplay (loaded at 0x1AE7C and other places). Sprites, tiles and fonts all decode cleanly with it.
- Decoders: `tools/anivga.py` (formats), `tools/extract_sprites.py`, `tools/extract_fonts.py`, `tools/render_levels.py`. Output goes to `original_source/extracted/` (local only).

### Levels and spawning (session 3)
- **Observed:** `StartLevel(levelFile)` @0x1B582: `CDPlay(LevelTrack[level])`; AniVGA `2bff(10, 0, 311, 199)` (inferred: clipping window x 10–311); scroll X/Y (`DS:0x25B4/0x25B6`) := 0; `LoadTile(TileSet[episode], 1)` with the string array at `DS:0xF38 + 0x100·episode` (`Ti1.lib`, `Ti2.lib`), so **levels 1–3 use TI1 and 4–6 use TI2**; then `LoadLevel` and `BuildLevel`. Level file names are a `string[255]` array at `DS:0xA32` (`level1.lev`…).
- **Observed:** `LoadLevel` @0x1B3ED (nested in StartLevel): `Reset(f, 1)`; for y = 1..200, x = 1..10: `BlockRead(LevMap[x, y])` with `LevMap` at `DS:0x6CA3 + 200·x + y`; then `BlockRead(DS:0x4442, 4200)`. So a .LEV is 2000 bytes of tiles and **600 spawn records of 7 bytes**.
- **Observed:** `BuildLevel` @0x1B4FF: AniVGA `50f2(0)`, `5063(1)`, `4feb(0, −6400, 320, 200)` (inferred: virtual background size/position), then for each map cell `PlaceTile32` @0x1B49E(tile, x = 32·(c−1), y = 168 − 32·(r−1)), which puts four 16×16 tiles `4(t−1)+1 … +4` (TL, TR, BL, BR) with AniVGA `5083`. The first file row is at the bottom; the level spans y = −6200 … 199.
- **Observed:** `SpawnFromLevel` @0x16653 (game loop): for each record 1..600 (`DS:0x443B + 7·i`): if `rec.y = scrollY (DS:0x25B6)` and `rec.flag ≤ byte DS:0x16C2`, take the record with `y := scrollY`; skip types > 0x4A; add Y offsets for types 08 (+20), 0F (+25), 14 (+10), 2D (+130, x −50), 36 (+30); type 40 also spawns two type-0x41 enemies (sub 0x23 and 0x24) at (x∓22, y−17); types **05, 20, 23, 3C, 43, 48 call `StartBossFight` 0x1627E**; type 42 → `SpawnEnemy(x, y, type, sub, 0x50)`; all others `SpawnEnemy(x, y, type, sub, 0)`.
- **Observed:** `SpawnEnemy(x, y, type, sub, mode)` @0x1163A: finds a free slot (< 30) in the enemy table at `DS:0x7C68`, 38 bytes per slot (`+0` AniVGA sprite slot = slot + 381 if `layer[type]` = 1 else slot + 813, `+2` type, `+5` sub, `+6` energy = word `DS:0x1966[type]`, increased in two-player mode (`DS:0x25A0`), `+0x18` x, `+0x1A` y, `+0x23` shadow slot = slot + 491 / 843). With mode 0 it sets `SpriteN := word DS:0x19FA[type]`, `SpriteX := x`, `SpriteY := y − height(sprite)` (so it enters from above the screen top), and plays type-specific sounds. `layer[type]` = byte `DS:0x191D[type]` (0/1/2; inferred: ground / air / special).
- **Observed (data):** the type → sprite table puts types 1–36 in GEG1 (episode 1) and 37–72 in GEG2/GEG21/GEG22; 73/74 use SHOTS sprites. Houses, churches, trees and cars are spawn records too (ground objects), and on the rendered spawn maps they land on matching terrain, which supports the coordinate interpretation.
- **Observed:** the background scrolls 1 px per frame (`ScrollStep` @0x15F68), which fits records firing on exact equality with odd Y values (162–230 per level).
- ~~Unknown: what `DS:0x16C2` is~~ **Observed (session 4):** a constant word 1 (the "6" noted earlier is the byte at DS:0x16C0). Nothing writes it (scan of segs 0x1000/0x1D9E); the only other reader is the shop table lookup `DS:0x16C2 + 2·item` (item ≥ 1, so element 0 is unused there). Every non-empty spawn record in LEVEL1–6 has flag 1 (flag 0 occurs only in empty slots, y = 100), so the filter never blocks anything: the remake spawns every record.
- ~~Unknown: `sub` and mode 0x50~~ **Observed (session 4):** `sub` = movement pattern (43 patterns, see "Gameplay (session 4)" and `docs/gameplay-spec.md` §7.3). A non-zero mode is a **spawn delay in frames**: the slot is reserved with energy := mode, the enemy update counts it down and then calls `SpawnEnemy(x0, y0, type, sub, 0)` (type 0x42: 80 frames). StartBossFight per level: see "Bosses".

### SFX playback (session 3)
- **Observed:** SMIX DSP setup @0x27A3D: on SB16 (`DS:0x87E9`) DSP command 0x41 with 0x2B, 0x11 (**11025 Hz**); otherwise 0xD1, 0x40 and a time constant from `TimeConstant(11025)` @0x27A04 (`256 − 1000000 div rate`).
- **Observed:** the mixer @0x288EB sign-extends sample bytes (`cbw`) into a 16-bit buffer; the clip table built @0x282EB clamps to −128..127 and adds 0x80. So the .SND samples are **signed 8-bit at 11025 Hz**. `tools/extract_assets.py` now writes them correctly (it used to assume unsigned 22050 Hz).

## Gameplay (session 4)
Static analysis only (REA/Ghidra decompiles + objdump of segments 0x1000 and 0x1D9E, initialised DS); nothing
here was observed in DOSBox-X yet, except that the level 4 boss core can't be hit before its parts are
destroyed (the user confirmed it in the game, session 4). The rules are written up in `docs/gameplay-spec.md`; this section is the
address ledger. Everything is **Observed** unless marked. "1d9e:XXXX" = linear 0x1D9E0 + XXXX.
Evidence IDs (session 4): game loop `ev_243f3ace…`; input `ev_8e5292c1…` (a1dd/a73e), `ev_f5831e6f…` (a34b/a58f);
player `ev_cb8af923…` (0fa3/0d24/0742/0f30), `ev_ca54fd31…` (07a4/055f/0cd5/05ca/0637), `ev_d4a118fd…` (330c/8978),
`ev_02e666ae…` (1d9e:1176/25b7/0be2/0d97/3bec/135d), `ev_006bb5b0…` (a951/b582/b600/b6d1), `ev_4e654f1c…` (07f8/d095);
weapons `ev_62efcd59…` (961c), `ev_aede7fbb…` (11a4), `ev_67aa34dc…` (3c37), `ev_b9d2ae83…` (3534/330c/92a4/2c03),
`ev_ed19c24a…` (2ca2, 1d9e:3c5a); enemies `ev_8af2266e…` (93cd/5671), `ev_7c8b31dc…` (5069/5041/4f2c/1055),
`ev_f7e95814…` (6a11/6b91/6bf1/67e5/1a08), `ev_1a6b9182…` (157a/1004/1421/1466/4071); shop/saves `ev_6d2d14e4…`
(84bc), `ev_61e25e7f…` (3c5a), `ev_d883f796…` (save/load), `ev_7d94e9ee…` (checksum), `ev_9c7a8402…` (b2e3/c4cd),
`ev_5d069216…` (cheat); misc `ev_79bdc251…` (1d9e:3105/2f7c/1421/1466/0d97).

### Input (see spec §2–3.1)
- Keyboard ISR @0x2100E: scancode → flag byte (make sets, break clears): Esc 6C30, Enter 6C2C, Ctrl 6C2D, Alt 6C2E,
  Space 6C2F, Up 6C2A, Down 6C2B, Left 6C28, Right 6C29, keypad− 6C31, keypad+ 6C32, PgUp 6C39, PgDn 6C3A, P 4440,
  G 6C33, E 6C34, D 6C35, A 6C36, N 6C37, K 6C38. E0-prefixed codes are not distinguished.
- Per-player input flags (P1, P2 = +0x0B): 6C3B left, 6C3C right, 6C3D fire, 6C3E up, 6C3F down, 6C40 altitude
  (1 high), 6C41 bonus select, 6C42 bonus fire, 6C43 bonus key latch, 6C44 altitude key latch, 6C45 respawn fly-in.
  6C64/6C65 = pending altitude swap (1 → high slots, 2 → low), handled by 1d9e:25B7 at the start of the next frame.
- `a1dd` keyboard: reads 6C28…6C2F for **both** players. `a34b` mouse (272c:0024 position, 272c:00DC(mask) = INT 33h
  AX=3 buttons): steers toward (x div 2, y), dead zone 5·max, buttons 1 fire / 4 select / 1+4 bonus fire / 2 altitude;
  @0x1A43A compares SpriteX with scrollY+10 for "move up" (bug, harmless). `a58f` joystick (271f:007E = INT 15h
  AH=84h DX=1 stick A → 6C54/6C56; 271f:0000 buttons → 6C60…6C63): ±15 around the centre 6C5C/6C5E sampled once at
  startup (@0x1D7A9). `a73e` movement: max = 2 or word DS:0x17EA[engine]; extents DS:0x185F/0x1865/0x186B/0x1871
  [jet]; frame base DS:0x1854[jet].
- Handler details (session 10, objdump of 0x1A1DD–0x1A73E). Parameters are far pointers to the per-player flags;
  keyboard/joystick: bp+0x30 left, 0x2C right, 0x28 up, 0x24 down, 0x20 fire, 0x1C select, 0x18 altitude high,
  0x14 altitude latch, 0x10 use, 0x0C pending swap, 0x08 vx, 0x04 vy. Mouse: bp+0x04 jet sprite slot (word),
  0x06 vy, 0x0A vx, 0x0E engine (byte), 0x10 pending swap, 0x14 use, 0x18 latch, 0x1C high, 0x20 select, 0x24 fire.
  - **Observed** keyboard: select = Space, use = Ctrl AND Space; Alt toggles when latch = 0 and pending = 0, and
    sets the latch whenever held. Velocity decays 1 toward 0 on frame mod 4 = 0 per axis without a direction.
  - **Observed** mouse: x = mouse x div 2 (stored at 5516), y = 5518; dead zone = byte(5 · word 17EA[engine]).
    Accelerates toward the pointer against SpriteX/SpriteY[slot] (the sprite corner); limits x ≤ 280 (right),
    x ≥ 12 (left), y ≤ scrollY + 168 (down), and "up" compares scrollY + 10 with **SpriteX** (bug, always true in
    practice). |x − mx| ≤ dz → vx toward 0, |my + scrollY − y| ≤ dz → vy toward 0, every tick. Buttons
    (272c:00DC mask): 1 fire, 4 select, 4 AND 1 use, 2 altitude (latch set only on a toggle).
  - **Observed** joystick: 271f:007E reads stick A into 6C54/6C56, 271f:0000 the four buttons into 6C60–6C63;
    direction = axis beyond centre (6C5C/6C5E) ± 15; button 1 (6C60) fire, button 2 (6C61) altitude (latch set
    only on a toggle), keypad − (6C31) select, keypad + (6C32) use; the same mod-4 decay as the keyboard.
  - **Inferred**: the latch difference never shows, because the loop runs the pending swap (1d9e:25B7) before the
    input handlers, so pending = 0 whenever they run.
- Pause: P sets 4440, release clears it; the loop @0x1BFD9 delays 500 ms, then waits for the next P.

### Per-player globals (P1 / P2)
| What | P1 | P2 |
|---|---|---|
| active | 15E1 | 15E2 |
| life energy (word) | 553C | 5540 |
| shield energy | 553E | 5542 |
| lives (spare ships) | 18EE | 18F0 |
| money (longint) | 18F2 | 18F6 |
| jet 1–5 / engine 0–3 / shield type 0–3 | 18FC / 5513 / 5511 | 18FD / 5514 / 5512 |
| vx / vy | 5544 / 5546 | 5548 / 554A |
| control type (1 kbd, 2 mouse, 3 joy) | 259E | 259F |
| invulnerability counter / flag | 25AA / 25AE | 25AC / 25AF |
| atom-bomb timer | 25A3 | 25A4 |
| ×5-damage timer | 5532 | 5534 |
| shadow offset dx, dy | 6C67, 6C68 | 6C69, 6C6A |
| bonus inventory (3 × id) | 550A | 550E |
| mounts (8 × 6 B) | 54AA | 54DA |
| player shots (48 × 19 B) | 756E | 78FE |
| sprite-slot list (stride 0x14) | 7542… | 7556… |
Sprite-slot list (set by 1d9e:0000): +0 pods (P1 130–137), +2 "I/II" label, +4 jet (128 / 253), +6 invulnerability
arc, +8 its digit, +A jet shadow, +C pod shadows, +E first shot slot (149 / 274), +10 unknown, +12 ×5 icon.
Globals: 15E0 scrolling, 15E4 level-end autopilot, 15E6 level 1–6, 15E7 episode, 25A0 two-player, 25B4/25B6 scroll X/Y,
552E frame counter, 5530 sprite-cycle counter, 6C52 level done, 6C53 game completed, 6C66 game-over countdown,
6C51 aborted, 3E04 CPU option, 3E05 "leave to main menu", 25A5 screen-shake counter.

### Records
- Mount (6 B): +0 i16 reload counter, +2 loaded, +3 occupied, +4 item id, +5 category (1 small, 2 large, 6 ball,
  8 standard weapon). Index 0 large nose, 1 small, 2 standard, 3/4 large inner L/R, 5/6 outer L/R, 7 ball.
  Allowed per jet: byte DS:0x18A4 + 8·jet + idx.
- Player shot (19 B): +0 sprite slot, +2 pattern, +3 active, +4 type, +5 age, +7 source mount (−1/−2 bonus),
  +8/+A start x/y, +C/+E target or angle, +10 target enemy, +12 shooter altitude.
- Enemy (38 B, slots 1–29 at DS:0x7C68 + 38·i): +0 sprite slot (381+i air / 813+i other), +2 type, +3 active,
  +4 wreck, +5 sub, +6 energy (= spawn delay while inactive), +8…+B inter-shot, +C…+F salvo pause, +10…+13 shots left,
  +14 age t, +16 aux counter c, +18/+1A x0/y0, +1C Real angle (−1000.0 = unset), +22 phase, +23 shadow slot, +25 layer.
  `FindFreeEnemySlot` @0x1159F: type 0x48 always slot 2, 0x4A slot 1.
- Enemy shot (13 B, 49 at DS:0x80CF + 13·i): +0 sprite slot (72…120), +2 pattern, +3 active, +4 kind, +5/+7 start,
  +9/+B target.
- Bonus object (8 B, 10 at DS:0x8582 + 8·i, sprites 22…31); id 0xFF = money label with a countdown (game loop).
- Explosion (14 B, 40 at DS:0x834C); sprite animation (5 B, 40 at DS:0x85D5).

### Routines
| Addr | Name | Notes |
|---|---|---|
| 0x10F30 | ShieldRecharge | +1 when frame mod DS:0x1808[type] = 0, cap DS:0x1802[type] |
| 0x10FA3 | LifeLost | life < 0: explosion, x 150 / y scrollY+300, refill, lives −1, invulnerable 100 |
| 0x10742 | RespawnFlyIn | y −= 3 until bottom above screen y 200 |
| 0x10D24 | PlayerOut | lives < 0: player removed; both out → 6C66 := 120 |
| 0x1055F / 0x10637 / 0x105CA | invulnerability start / tick / end | arc sprite 544, sounds 16/44/43 |
| 0x107F8 | LevelStartSprites | HUD, start positions (60,140) / (140,140) |
| 0x1B2E3 | InitPlayer(n) | 5 lives, 0 money, jet 1, engine 1, shield 1, standard weapon |
| 1d9e:0000 | LevelReset | refill life/shield, clear tables, altitude high, P1 velocity 0 (P2's not: bug) |
| 1d9e:1176 | DrawEnergyBars | 33-line bars, shield y 79, life y 171 |
| 1d9e:25B7 | AltitudeSwap | moves 24 sprites between slot ranges (P1 125–148 / 523–546, P2 250–273 / 648–671) |
| 1d9e:1C8A | Shadows | player shadow offset 2 ↔ 12, 1 px / 2 frames; enemy shadows |
| 1d9e:0D0E | AddMoney | ×2 in two-player, clamp ≥ 0 |
| 0x18978 | Collisions (per player) | shots vs enemies, enemy shots vs player, ramming, ball pod |
| 0x1961C | FirePods | per loaded mount, volley table in spec §4.3 |
| 0x111A4 | SpawnShot | 48 slots; Autogun picks `Nearest(1)` |
| 0x192A4 | ReloadPods | interval = ItemInfo field 9 |
| 0x13C37 | MoveShots | 24 patterns + ball-pod orbit |
| 0x13534 / 0x1330C | BonusInventory / PickupBonuses | |
| 0x12CA2 | UseBonus(kind) | kinds 1–10 |
| 0x12C03 | BombTimer | flash at 5, −100 to every enemy at 0 |
| 0x16C0E | EnemyUpdate | 43 movement subs, despawn, hooks, delayed spawns |
| 0x16A11 | Arc | angle += 40·step/r, done at a1 |
| 0x14F2C | MoveTowards (Line) | major axis ±speed, minor interpolated |
| 0x167E5 | Direction8 | 0 up … 7 up-left |
| 0x11055 | Nearest(mode) | 1 enemy with reward > 0, 2 player (Manhattan) |
| 0x193CD | EnemyGuns | salvo logic, class tables DS:0x1D73… |
| 0x16B91 | FireAllGuns | scripted fire |
| 0x15069 / 0x15671 / 0x15041 | EnemyFire / MoveEnemyShots / KillEnemyShot | 22 flight patterns |
| 0x12A1E | EnemyDestroyed | money (DS:0x1BB6), boss split, civilians sound 45 |
| 0x11A08 | KillEnemy | explosion, wreck (DS:0x1A8E), bonus drop 14 %, boss core → 15E4 := 1 |
| 1d9e:0F5D / 0DC1 / 0BE2 / 0D97 | DropBonus / pick id / wobble / remove | thresholds DS:0x1768 |
| 1d9e:157A / 1004 / 1447 | Explode / ExplosionTick / Quake | kinds 1–25, anim types 1–11 |
| 1d9e:1421 / 1466 | shake apply / restore | scrollX += Random(10) around Animate |
| 1d9e:4071 / 33FA | StartAnim / AnimTick | 43 anims (DS:0x1458…) |
| 1d9e:3105 | SpriteCycles(episode) | 48 global + 24/37 episode cycles (DS:0x1236…) |
| 1d9e:2F7C | sprite cache | AniVGA sprite data paging; not gameplay |
| 0x1627E | StartBossFight | per level parts, track 8 |
| 0x122C3 | BossScript(action) | per level, fixed enemy slots |
| 0x1A951 | LevelEndAutopilot | fly out, level+1 / game completed |
| 0x1B6D1 | AfterLevel | |
| 0x1B600 | MemoryGuard | every frame: if MemAvail < 140000 bytes, clears explosions, all shots, dead enemy sprites, enemy shots. The user remembers writing this "reaper"; not replicated (decision, user, session 4) |
| 0x1AA36 | CPU delay | Delay(6/9/12/16) |
| 0x1CF34 | Cheat | G-E-D-A-N-K-E in the hangar → both money 666666 |
| 1d9e:84BC | Shop | helpers 3C5A ItemInfo, 6216 offers, 75BE buy, 5165/5558 sell, 6A7E exchange |
| 1d9e:0350 / 05D9 / 02CC | SaveGame / LoadGame / checksum | `docs/file-formats.md` |
| 0x1C4CD / 0x1AA85 / 0x1AB37 | Options / write / read SETTINGS.DAT | |
| 30ea:13BE / 13D1 / 1745 | Cos / Sin / Random | System RTL |

### DS tables (index = type, jet, item …; Pascal virtual bases)
- Jets: max life word 0x188A, ram damage 0x1894, extents bytes 0x185F/0x1865/0x186B/0x1871, frame base 0x1854,
  mounts 0x18A4, pod placement 0x18FE/0x190E. Engines: speed 0x17EA. Shields: max 0x1802, recharge 0x1808.
- Shop/items (`1d9e:3C5A ItemInfo(cat, field, id)`): small pods price 0x16DC, sprite 0x16C2, sound 0x16FB,
  reload 0x16D0; large pods 0x172C / 0x1702 / 0x175B / 0x1718; boni price 0x179E, sprite 0x1772, HUD offset 0x1795,
  immediate/shop flag 0x1789, pickup sound 0x17CD; engines 0x17DC / 0x17D8; shields 0x17F4 / 0x17F0; ball pods
  0x1814 / 0x180E, contact damage 0x1826, orbit factor 0x182F, reload 0x1832; jets 0x1874 / 0x184A; standard
  weapons sprite 0x18D2, sound 0x18E7, reload 0x18DC. Save price computed (4000 + 10000·min(level−2, 4)).
- Player shots: sprite 0x162A, speed 0x168E, damage 0x165C.
- Enemies: energy 0x1966, sprite 0x19FA, layer 0x191D, wreck 0x1A8E, ram damage 0x1B22, money 0x1BB6,
  shadow 0x1C4A/0x1CDE, gun class 0x1D73; guns 0x1DBD (delay), 0x1DDF (script only), 0x1DFD (kind), 0x1E7C/0x1F84
  (offset), 0x208C/0x2194/0x229C (inter/pause/salvo), 0x23A4 (flight). Enemy shots: sprite 0x24B4, damage 0x24EE,
  sound 0x2528, speed 0x2562.
- Bonus drop thresholds 0x1768. Anims 0x1458/0x14AE/0x1505/0x1530/0x1586. Sprite cycles 0x1236/0x1296/0x12F7 (global),
  0x1326/0x1356/0x1387 (episode 1), 0x139E/0x13E8/0x1433 (episode 2).

### Sounds
The PlaySound number is a 0-based index into the SMIX load list (`STDSHOT` … `LOSER` = 0–34 from AREA.SND,
`BOSS2W1` … `GLASER` = 35–58 from AREA2.SND; names in DP.EXE @file 0x21AA). **Inferred** from every use matching
its name (42 SLOSER at game over, 45 SZIVIL for civilians, 49 HELI, 5 ENGINE, 53–58 Golem). PlaySound's first
argument 1 = loop (I: those sounds are stopped explicitly later).

### Findings that contradict earlier notes
- 0x18EE/0x18F0 are lives (not energy); life energy is 0x553C/0x5540.
- DS:0x16C2 = 1 (not 6); the spawn flag filter is a no-op.
- The game loop has a per-frame CPU delay (see "Program structure").
- Shadows are the same sprite in AniVGA shadow mode; ASCHEN1/2 hold wreck sprites.

## Engine tables (session 5)
Static analysis for the table export (`tools/game_tables.py`) and the engine. Evidence IDs (session 5):
`ev_750797113e…` (Explode 1d9e:157A), `ev_9394a67947…` (AddExplosion 1d9e:1483), `ev_2517ba0974…` (KillEnemy
0x11A08), `ev_5386e8ce49…` (SetShadowTab 28be:0106), `ev_9c53ea1247…` (HitDetect 28be:29B9), `ev_716eb55c2b…`
(FirePods 0x1961C). Other routines were read from REA CLI decompiles (`tools/rea.sh decompile`).
- **Observed:** sprite position tables: SpriteX = `DS:0xC2F0 + 2·slot` (the code writes it as `-0x3D10`), SpriteY =
  `DS:0xCA22 + 2·slot` (`-0x35DE`), SpriteN = `DS:0x3146 + 2·slot`, display mode byte = `DS:0xB820 + slot`
  (3 = shadow). Confirmed by the player bound check @0x1A7CD (`L + SpriteX ≤ 12`).
- **Observed:** `AddExplosion(anim, delay, x, y)` @1d9e:1483 (nested in Explode): first free of 40 records
  (14 B at DS:0x834C: +0 sprite slot = i + 31 if the parent's altitude byte is 1, else i + 451; +2 x; +4 y;
  +6 current frame := first[anim]; +8 delay; +A active; +C altitude; +D anim). `Explode(x, y, kind, altitude)`
  @1d9e:157A builds kinds 1–25 from AddExplosion calls with fixed or Random() offsets; the list is transcribed
  in `tools/game_tables.py` (`EXPLOSION_KINDS`). Kinds 12 and 15 scatter over the screen (x = Random(320/300) − 40,
  y = scrollY + Random(220/200) − 40); kind 15 first calls Quake(40).
- **Observed:** `ExplosionTick` @1d9e:1004: every tick `delay −= 1`; on ticks where `frame mod rate[anim] = 0` and
  delay < 1: show the current frame at (x, y), play sound[anim] on the first frame if fewer than 7 voices play,
  remove the record when the frame is past last[anim], then frame += 1.
- **Observed:** `KillEnemy` @0x11A08 calls `Explode(SpriteX + dx, SpriteY + dy, kind)` per type (table in
  `tools/enemy_table.py` `EXPLOSION`); type 0x17 uses (−70 + Random(30), −50 + Random(30)).
- **Observed:** `StartAnim(anim, slot)` @1d9e:4071 / `AnimTick` @1d9e:33FA / `AnimEnd` @1d9e:33A1: 40 records
  (5 B at DS:0x85D5). A new anim on a slot cancels the old one. Frames first[a] (DS:0x1458) … last[a] (0x14AE),
  one step on ticks where `frame mod rate[a]` (word 0x1586) = 0; at the end, if ping-pong[a] (byte 0x1505) the
  anim runs back to first, then AnimEnd sets the sprite to rest[a] (0x1530). Anims 0x1F and 0x2B start at last
  and run backwards. The anim stops early if the sprite left the range or was cleared.
- **Observed:** `SpawnShot(type, pattern, dx, dy, jetSlot, mount, …)` @0x111A4: the shot sprite starts at
  (SpriteX[jet] + dx, SpriteY[jet] + dy); FirePods passes dx/dy relative to the nose (cx, T), the large-pod mount
  point (`1d9e:0B2C`: mount 0 at cx + (−7, −22), 3/5 at L + (−17/−35), 4/6 at R + (4/22), y T + 14/16) or the ball
  pod (+5, +5). The fire sound (ItemInfo field 8) plays per shot when fewer than 5 voices play, except for the
  Autogun (cat 1 id 4), whose branch picks the target instead (spec §12 bug 4). ~~Missile shots (cat 1 id 1) start
  anim 5~~ (session 7 correction: the test is item 1 **cat 2**, the Flamer; anim 5 = flame frames 157–166). The mount is unloaded only if a shot slot was free.
- **Observed:** `SetShadowTab(brightness)` AniVGA @28be:0106, called with **70** at startup (@0x1B295) and at level
  start (@0x10CCC). For each colour c of the current 6-bit palette (DS:0xD25E): target = (r·b div 100,
  g·b div 100, b·b div 100); pick the first colour j with every channel ≤ the target and minimal squared RGB
  distance; if none, the first colour with minimal squared distance. Shadow-mode sprites (mode byte 3) replace each
  background pixel under an opaque sprite pixel by `shadow[background]`.
- **Observed:** `HitDetect(slotA, slotB)` AniVGA @28be:29B9 (called through 1d9e:3BEC): false if the slots are equal
  or a sprite is empty. Otherwise, over the overlap of the two bounding boxes: a hit needs **some overlapping row**
  where the opaque spans [x + left[row], x + right[row]] of both sprites intersect, **and some overlapping column**
  where [y + top[col], y + bottom[col]] intersect (empty columns, top = 16000, are skipped). The row and the column
  need not be the same, so it is not pixel-exact: an L-shaped sprite can "hit" through its empty corner. Self-
  modifying code (immediates patched through CS).
- **Observed:** `StartBossFight` @0x1627E: scrolling off; fade; both players' SpriteY := scrollY + 160; clears enemies,
  shots, enemy shots, explosions, bonus objects; per level PlaySound / SpawnEnemy calls (transcribed in
  `tools/game_tables.py` `BOSS_SPAWNS`; y passed to SpawnEnemy is the bottom edge, e.g. level 1 escort at
  (117, scrollY + 117)); `Delay(1200)`; fade in. Level 4 starts sound 51 looping (`PlaySound(1, 0x33)`).
- **Observed:** level CD tracks: bytes at DS:0x1032… = 5, 6, 7, 5, 6, 7, 7 (element for level n at 0x1031 + n).
- **Observed (draw order):** AniVGA `Animate` @28be:2CEF restores the background, then loops SI from 0x730 (slot 920)
  down to 0 (@28be:4722–4AC0), so lower slots are drawn last, in front. When SI reaches `DS:0xFCDA` (= 2·8, set by
  28be:2BDE(8) at level start) the clip window switches to the full screen: slots 0–8 are the HUD.
  `SetAnimateWindow(x1, y1, x2, y2)` @28be:2BFF rounds x1 down to a multiple of 4 and the width to a multiple of 4:
  (10, 0, 311, 199) → x 8–311.
- **Observed (player slots):** LevelReset @1d9e:01B7 sets P1 pods 130 (+mount), label 129, jet 128, arc 125, digit
  126, jet shadow 138, pod shadows 139 (+mount), first shot 149, ×5 icon 127; P2 +125. AltitudeSwap moves 24 slots
  (P1 125–148) by +398 to the low range 523–546 and shifts the slot list, including the first-shot slot (new shots go
  to 547+; existing shots keep theirs).
- **Observed (HUD):** LevelStartSprites @0x107F8 and ScrollStep @0x15F68: slot 5/6 money text sprite 837/838 at
  (20/240, 10), slot 1/2 icon 491 at x 30/260, y scrollY + 25, slot 3/4 lives text 813/814 at x 45/275, y scrollY + 27,
  slots 7/8 frame 490 at (scrollX + 311 / scrollX, scrollY), slots 9–14 bonus inventory. Text sprites are made by
  1d9e:2E58 (AniVGA 28be:1FC5) in the current font (FIRE in the capture); money = "$" + Str(money) (literal @1d9e:0D0C).
  DrawEnergyBars @1d9e:1176: `Line(scrollX + a + 1, Y, scrollX + a + 3, Y)` with a = 2 (P1) / 313 (P2) and
  Y = base − 2c for c = 1…33 (the y variable decreases twice per line), so lines are 2 px apart.
- **Observed (Real arithmetic):** RTL 30ea:12B0 = Trunc, 30ea:12B8 = Round (CH = 0/1 into 30ea:1218); far calls
  0x3000:21xx are aliases of 30ea:12xx (e.g. 0x3000:2158 = 30ea:12B8). 1d9e:09EE / 0A6A = cx + Round(r·cos a°) /
  cy − Round(r·sin a°) (constants 2.0, π, 360.0 decoded from the Real48 operands).
- **Observed:** EnemyUpdate sub 3: x = Round(x0 + 40·sin(8t°)) (constants 2π, 360, 8, 40 @0x16D17–0x16D4B).
  Arc @0x16A11 = `Arc(sprite, enemy, cx, cy, r, step, a0, a1, next)`: angle := a0 if unset (−1000.0), angle +=
  40·step/r, position by 09EE/0A6A, next phase when angle ≥ a1 (step > 0) or ≤ a1 (step < 0).
- **Observed:** MoveTowards @0x14F2C(speed, ty, tx, sy, sx, &y, &x): ty/tx nudged by 1 when equal to the start; the
  axis with the larger distance steps by ±speed, the other = start + Round(Δother·|major − start| / |Δmajor|).
- **Observed:** EnemyFire @0x15069 plays the sound of **gun 1's** shot kind for every gun (only if fewer than 4 voices
  play); enemy-shot slots 72–120; aimed patterns 5/6 target (player x + width div 2, player y (+ height div 2 when
  not scrolling)).
- **Observed (collisions):** shot-hit explosions by shot type: 1, 2, 7, 9, 11, 15, 18, 20, 23 → kind 1 at the shot;
  4, 8, 19 → kind 4; 6, 13, 17, 21 → kind 3; 3 → kind 7 at (shot x, enemy y); 5 → kind 1 at enemy + (5, 5);
  14 → kind 18 at (shot x − 16, enemy y + height − 30); 16 → kind 23 at (shot x − 18, shot y − 5). Ramming the Golem
  parts explodes kind 1 at jet + (−15 + Random(60), −15 + Random(60)) (@0x19058). Enemy energy < 1 = destroyed.
- **Inferred (bug, spec §12 #12):** the shots-vs-enemies loop doesn't re-check `active` inside the shot loop; after a
  kill with a wreck, `+0` points at the wreck slot, so a second shot in the same tick hits the wreck and calls
  EnemyDestroyed again.
- **Observed:** ShieldRecharge @0x10F30 (frame mod recharge = 0 → +1, cap), LifeLost @0x10FA3 (explosion kind 9 at
  jet − (80, 80) + Random(30) each), RespawnFlyIn @0x10742, Invulnerability tick @0x10637 (every 20 ticks: arc 544,
  digit text sprite 815/816 = counter div 20; arc at jet + (cx − 21, T − 8), digit at jet + (cx − 5, T − 25)).
- Data-table element sizes (all checked against the spec values by `tools/game_tables.py --check`): prices are
  longints (base + 4·i); jet frame base, shield recharge and ball-pod reload are words (the session-4 ledger did not
  give sizes).

## Bonuses, boss start/end, sounds (session 6)
Static analysis (REA CLI decompiles/instructions of DP.EXE, objdump of segments 0x1000/0x1D9E). Everything
**Observed** unless marked. Evidence IDs are in the scratch decompiles of this session (`ev_f0f453b3…` for
DropBonus 1d9e:0F5D; the others were not kept). Rules in `docs/gameplay-spec.md` §5, §8.1–8.2, §9.1, §11, §12.
- **Real constants** (TP Real48 in CX:SI:DI, CL = exponent, DI = high word): (0x82, DAA2:490F/2182) = π,
  (0x83, …) = 2π, (0x89, 0x3400) = 360, (0x83, 0x6000) = 7, (0x83, 0x2000) = 5, (0x86, 0x2000) = 40,
  (0x82, 0x4000) = 3, (0x87, 0x4800) = 100. `x·2·π/360` = x degrees, so "(angle shl 1)·π/360" is angle°, not 2·angle.
- `DropBonus(x, y, roll, reward)` 1d9e:0F5D: for i = 1..12, `byte[0x1767+i] ≤ roll < byte[0x1768+i]` →
  `PickBonus(i)` 1d9e:0DC1 (rejects i > 11). Bytes 0x1767… = 0, 0, 55, 60, 65, 67, 72, 74, 81, 88, 98, 100, 100, 137:
  kind 11 is never dropped, roll 100 only matches i = 12 (rejected). KillEnemy @0x11A08 calls it with the enemy's
  SpriteX/Y after `drop ∧ reward > 0 ∧ Random(100)+1 < 15`, after the sprite is cleared and before the wreck.
- Bonus record (8 B at DS:0x8582 + 8i): +0 x0, +2 y0, +4 word (the reward at the drop; the label countdown), +6
  active, +7 kind (0xFF = label). Sprite slot 21 + i. Position (0DC1 and wobble 1d9e:0BE2): x0 + Round(5·cos(7·frame°)),
  y0 − Round(5·sin(7·frame°)), frame = DS:0x552E; 0BE2 runs when the counter DS:0x6C6B drops below 1 (reset to 2)
  and removes objects below scrollY + 210 (`RemoveBonus` 1d9e:0D97 clears +6 and the sprite only).
- Game loop @0x1BA9C: label countdown (+4 −= 1, at < 1 kind := 0 and remove); ×5 timers DS:0x5532/0x5534 clear the
  icon slot (list +0x12) at 0. Then later: BombTimer(P1/P2) after SpawnFromLevel, MoveShots, BonusInventory (P1
  unconditionally, P2 if active), MemoryGuard, PickupBonuses (if active).
- `PickupBonuses(altitude, …)` @0x1330C: returns at once unless the altitude flag (6C40/6C4B) is 1 (high). HitDetect
  jet ↔ slot 21+i; PlaySound(pickup[kind]) and again if ≠ 4; non-inventory kinds (DS:0x1789 = 0) → UseBonus, kind 1
  becomes a label (+4 := 100, active 0, kind 0xFF, sprite 0x237/0x23C in two-player); inventory kinds → first empty
  slot via `Install(player, cat 3, bonus, slot)` 1d9e:2A0C → 1d9e:27CA, which only sets pending slot/item
  (DS:0x5537/0x5539, P2 0x5538/0x553A); with no empty slot → UseBonus.
- `BonusInventory` @0x13534: delivers the pending item (sprite DS:0x1772[kind] into slot 9 + pending slot),
  use/select/latch, one compaction pass, positions (30i + HUD x + DS:0x1795[kind], scrollY + 171), selection frame
  0x1EC at 30·sel + HUD x (y set by ScrollStep: scrollY + 168, slots 15/16). HUD x 0x19 / 0xD2; slots 9 / 12.
- Keyboard @0x1A1DD: 6C41 (select) := Space, 6C3D (fire) := Ctrl, 6C42 (use) := Ctrl ∧ Space.
- `UseBonus(kind, jet)` @0x12CA2 — 1: AddMoney 1000; 2: KillShot 47, SpawnShot(12, 13, cx − 3, 0, jet, −1), sound 15;
  3: invulnerable 200; 4: lives + 1; 5: sound 31, KillShot 0..47, 20 × SpawnShot(10, 11, 0, 0, −1); 6: Explode(jet x,
  jet y, 12, low), scrolling: energy := 0 and EnemyDestroyed(jet, i, explode 1, drop 0) for every active enemy, else
  energy −= 150 and the same when < 1; sound 14; Quake(50); 7: KillShot 46, 47, SpawnShot(11, 12, cx, 0, −1) and
  (…, −2), sound 11; 8: life/shield += Round(max/100·40), capped (shield table DS:0x1802[type]), sound 20; 9: KillShot
  42..47, 5 × SpawnShot(22, 22, cx, 0, mount = i), sound 20; 10: ×5 timer := 666, icon 0x1D0 at jet + (cx − 12,
  13BF − 12) where 1d9e:13BF = T + (B − T) div 2.
- `SpawnShot` @0x111A4 initial angles: type 10 Random(360); type 11 with mount −1 → 0; mount −2 → 180; type 22 → 72·mount.
  For mount ≥ 0 or −2 it writes `mount[m].loaded := 0`, and the sound path reads mount[m] (spec §12 #14).
- `BombTimer(&t)` @0x12C03: at t = 5 FillChar(DS:0x3E40, 768, 0x32) and SetPalette (flat grey, DAC 50); t −= 1; at 0
  SetPalette(DS:0x4140) and every active enemy −100, EnemyDestroyed(nobody (0), i, explode 1, drop 1).
- `EnemyDestroyed(player, i, explode, drop)` @0x12A1E (parameter order corrected: the earlier ledger had drop/explode
  swapped in name only); drop := 0 when not scrolling; civilians: if not SoundPlaying(45) → PlaySound(45) ×3; type
  0x21 refills and calls BossScript(1) instead of KillEnemy.
- MoveShots @0x13C37: pattern 10 x = Round(sx + c·sin(3·oldY°)) (oldY = SpriteY before moving, local BP−4);
  11/22 use cos/sin of angle° with r = 3c + 20 / c + 15 around (jet x + cx − 6, jet y + B div 2 − 6) /
  (… − 53, … − 42); 12 x = Round(sx + 40·sin angle°) − 5; 13 at c > 80: bomb timer := 5, Explode(x − 65, y − 65, 14, 0).
- KillEnemy boss end @0x11A08: boss core → DS:0x15E4 := 1; level 4: StopSound(0x33), PlaySound(0x32) ×2; every other
  active enemy except type 0x48 is cleared (active, wreck flag, sprite, shadow, energy). Type 0x0D → BossScript(1);
  type 0x48 → sprite 0x535, sub 0x2A, t := 0.
- EnemyUpdate sub 0x14 @0x16C0E: c (+0x16) += 1; ranges 1–50 / 51–100 / 101–140 / 141–165 / 166–215 / 216–305 /
  306–330 / 331–380 / 381–425 as in spec §8.2; c > 425 → 0; sound 0x25 ×2 at c 140 and 305; type 0x23 calls
  FireAllGuns(0, i) @0x16B91 (every gun with a kind ≠ 0 → EnemyFire) at c 50, 140, 305.
- BossScript(5) @0x122C3 (called from Collisions for boss types on every hit): level 1 `if Random(3) = 0` →
  PlaySound(0x23 + Random(3)) ×2; level 2 the same with 0x11.
- StartBossFight @0x1627E: `FadeOut(0, 20, 0)` 1d9e:0907 = FillChar(black) + AniVGA Fade 28be:027F(20 steps) +
  SetPalette; CDPlay(8); players' SpriteY := scrollY + 160; ScrollStep; clears 29 enemies, 2 × 48 shots (0x0CD5),
  49 enemy shots (0x5041), 40 explosions (1d9e:0FA4), 10 bonus objects; per-level sounds and SpawnEnemy;
  `Delay(1200)`; sprite cache, Shadows, Animate; `FadeIn(20, 0)` 1d9e:098A.
- AniVGA Fade 28be:027F(steps, target): 19 interpolation steps `cur + (target − cur)·i/19` (i = 0..18), then the
  target; each SetPalette 28be:01F6 waits for the start of a vertical retrace (port DS:0xFCC0 bit 3) and rebuilds the
  shadow table. So a fade takes 20 retraces ≈ 0.29 s at 70 Hz.
- LevelEndAutopilot @0x1A951: x > 162 → −3, x < 158 → +3 (P2 132/128), y −= 3; when both (P_n y ≤ scrollY − 30 or
  inactive): StopSound(5) if sound is available, DS:0x6C52 := 1, level + 1 or DS:0x6C53 := 1 after level 6.
- AfterLevel @0x1B6D1: DS:0x3E05 := 1 on abort or game over (no fade, back to the main menu), else FadeOut(1, 20, 0);
  clears 920 sprite slots and the 40 anims; LevelReset; stops every playing sound except 0x32.
- LevelReset 1d9e:0000 also clears: pending items 5539/553A, selections 5528/552A, bomb timers 25A3/25A4,
  invulnerability counters 25AA/25AC, ×5 timers 5532/5534, quake 25A5.
- PlayerOut @0x10D24: clears pods, pod shadows, jet, jet shadow, label, inventory (+ HUD slots), shots, selection
  frame; ends invulnerability; life/shield := 0; lives text := "Loser!" (literal at 0x10D1D, CS-relative) and its x :=
  the money's x; lives icon slot := 0; both out → DS:0x6C66 := 120. The game loop ends when the countdown is 1.
- Sounds: PlaySound(n, loop) @1d9e:4173 pushes n first, then the loop flag. Looped call sites: 16 @0x1059D (only if
  not SoundPlaying(16)), 0x33 @0x164F1, 0x1F @0x182F3/0x182FF, 5 @0x1D2F5, 0x31 @0x1D31D (hangar "Shoot em all":
  5 if an active player's jet ≠ 4, 0x31 if = 4). StopSound 2769:0A75 sites: 16 @0x1062E, 0x33 @0x11F70, 0x1F
  @0x1846A, 5 @0x1AA18, all @0x1B773. SMIX StartSound 2769:09DC takes the first of 32 free voices and counts them
  in DS:0x87EA.

## Remaining player weapons (session 7)
Static analysis (REA CLI decompiles + instructions). Evidence IDs: `ev_fbd4a1c2…` (SpawnShot 0x111A4),
`ev_59ca30e1…` (Nearest 0x11055), `ev_a9fcffc2…` (Collisions 0x18978), `ev_6f5f782b…` (LevelStartSprites 0x107F8);
MoveShots 0x13C37 from the instruction listing. All **Observed** unless marked. Rules in `docs/gameplay-spec.md`
§4.3, §4.5, §12 #15–16.
- RTL Real calls in MoveShots: far 0x3000:214C = 30ea:12AC (Longint → Real), 2126 = 1286 (add), 2138 = 1298
  (multiply), 213E = 129E (divide; left operand in DX:BX:AX, right in CX:SI:DI), 225E = 13BE (Cos), 2271 = 13D1
  (Sin), 2158 = 12B8 (Round). New constants: (0x89, 0x2000) = 320, (0x86, 0x4800) = 50.
- 1d9e:2754 / 2791 = sprite width (AniVGA header word +8 × 4) / height (+0xA) of a sprite number; 1d9e:088D / 08CA
  = SpriteX + width shr 1 / SpriteY + height shr 1 (box centre).
- `Nearest(mode, y, x)` @0x11055 mode 1: enemies 1..29 with +3 active and reward (DS:0x1BB6 + 2·type) > 0;
  d = |y − SpriteY| + |x − SpriteX| (top-left), strictly smaller than the best so far, start 1000; 0 = none.
- SpawnShot Autogun branch (mount item 4, cat 1): target := Nearest(1, centreY(jet), centreX(jet)); 0 → KillShot,
  else +C/+E := target sprite centre. The flow continues (the mount is unloaded either way). The Flamer test
  (item 1, cat 2) starts anim 5 on the shot.
- MoveShots patterns 2/3: y −= speed, x ±1. Pattern 6: y −= 3, x = Round(sx + 50·sin(oldY·2π/320·2)). Patterns 7/8
  (@0x1402E): 8 first copies the target enemy's SpriteX/Y (top-left) into +C/+E; major axis by |ty − sy| < |tx − sx|,
  step toward the target from the **start** comparison (tx < sx), minor = start + Round(Real(Δ·|cur − start|) /
  |Δmajor|) where the product is `MUL BX` + `CWD` (16 bits; spec §12 #15). Pattern 9: `1d9e:0B2C(jetSlot, jet,
  mount)` → mount point in DS:0x753C/0x753E; x/y = jet + point + (−39, −64); KillShot at c > 18. Pattern 23:
  +C := 1 if Random(10) < 5 else −1, x += 7·(+C), y −= Random(6) + 4, every tick.
- MoveShots tail @0x14E22: if mount 7 occupied: a = k[item] (byte DS:0x182F + item) · ((frame mod 360) shl 1)·π/360
  (π, not 2π: k degrees per tick); ball slot (pods + 7) = (cx + jetX − 6 + Round(40·cos a), B shr 1 + jetY − 6 −
  Round(40·sin a)).
- Collisions ball part @0x190F3 (after ramming), if mount 7 occupied: enemy shots 1..49 active ∧ HitDetect(ball,
  shot) → KillEnemyShot, Explode(shotX, shotY, 3, byte[0x7C8D + 38·k]) (enemy record k's layer, spec §12 #16);
  enemies 1..29 active, type ∉ 0x48..0x4A, layer = player's altitude or 2, HitDetect → only if the jet slot is P1's
  (spec §12 #3): energy −= word DS:0x1826 + 2·item; frame mod 3 = 0 → Explode(ballX − 5, ballY − 5, 2, layer);
  energy < 1 → EnemyDestroyed(player, i, 1, 1). No core-shield or Golem-age checks.
- LevelStartSprites @0x107F8: pods with cat 2 **or 6** get ItemInfo(cat, 2, item) as sprite at jet + (int DS:0x18FE +
  2i, int DS:0x190E + 2i) = (−7, −22), (0, 0), (0, 0), (−17, 14), (4, 14), (−35, 16), (22, 16), (0, 0): raw offsets
  without the cx/L/R base (ScrollStep moves the large pods to their mounts before the first draw).

## Enemies of episode 2 and the bosses (session 7)
Static analysis (REA CLI decompiles + objdump of segment 0x1000). Evidence IDs: `ev_f8520d73…` (EnemyUpdate
0x16C0E), `ev_a851d347…` (BossScript 0x122C3), `ev_a8554c4f…` (Golem attack chooser 0x16BF1), `ev_451070c9…`
(Direction8 0x167E5), `ev_1e4fba22…` / `ev_7bf8f444…` (1d9e:09EE / 0A6A), `ev_c2036554…` (EnemyFire 0x15069),
`ev_220a9938…` (MoveEnemyShots 0x15671), `ev_2517ba09…` (KillEnemy 0x11A08), `ev_623e4e70…` (EnemyDestroyed
0x12A1E). All **Observed** unless marked. Rules in `docs/gameplay-spec.md` §7.3–7.5, §8, §12 #7–9, #17–19.
- Ghidra lists Pascal parameters in reverse declaration order (last pushed first): e.g. `FUN_1000_163a(delay, sub,
  type, y, x)` is SpawnEnemy(x, y, type, sub, delay); `FUN_1000_1a08(drop, explode, i)`; `FUN_1000_4f2c(speed, ty,
  tx, sy, sx, &y, &x)` = MoveTowards(&x, &y, sx, sy, tx, ty, speed); `FUN_1000_6a11(link, next, a1, a0, step, r, cy,
  cx, i, slot)` = Arc(slot, i, cx, cy, r, step, a0, a1, next); PlaySound shows as (loop, n).
- 1d9e:09EE(centre, r, angle) = Round(centre + r·cos(angle·2π/360)); 1d9e:0A6A = Round(centre − r·sin(…)).
- `Direction8(x, y, tx, ty)` @0x167E5 (nested): dx = tx − x, up = y − ty; dx = 0 → up < 0 ? 4 : 0; else r = up/dx
  (Real) against the Real constants 2.414 and 0.414 (CX:SI:DI 2382:F9DB:1A7E and 177F:CED9:53F7; ± by the sign
  bit): dx > 0: r > 2.414 → 0, > 0.414 → 1, > −0.414 → 2, > −2.414 → 3, else 4; dx < 0 the same plus 4 (mod 8).
- `Nearest(2, y, x)`: one active player → that one; both → Manhattan from (x, y) to each jet's SpriteX/Y, P1 only
  if strictly nearer; none → 0 (callers then use P2's jet).
- EnemyUpdate subs (record +0x14 = t, +0x16 = c, +0x18/+0x1A = x0/y0, +0x22 = phase); the full list is in spec §7.3.
  Details beyond the session 4 summary: sub 7 phase 1 c −= 5, x = 09EE(x0 − 50, 50, c), y = 0A6A(y0, 50, c), c < −360 →
  phase 2, c := 180; phase 2 c += 5 around x0 + 50, c > 540 → phase Random(2) = 0 ? 3 : 1, c := 0; phase 3 swoop 1–30
  (−2, +2), 31–60 (+4, 0), 61–90 (−2, −2), 121 → phase 1. Sub 8: c += 1; phase 0 waits for c = 40; phase 1
  MoveTowards(x0, y0 → 4, scrollY + 4, speed 2) until x < 8 ∧ y < scrollY + 8; phase 2 1–30 (+2, +2), 31–60 (+2, −2),
  61–100 SpawnEnemy(x + 15, y + 40, 0x0E, 3) when c mod 5 = 0, 101–130, 131–160 as before, 161 → phase 3, c := 10;
  phase 3 x −= 3, FireAllGuns(0) when c mod 20 = 0, x < 8 → phase 2, c := 1. Sub 0x12 (snake): phase 1 y += 2 until
  y > scrollY + 50, then the Arc/straight chain of spec §8.4 (Arc steps ±6 at r 30/40/60/100). Sub 0x13:
  MoveTowards(x0, y0 → energy, c, 9), removed (KillEnemy 0, 0) when y < scrollY. Sub 0x22 and 0x27 as spec §8.5/8.7
  (0x27 phase 4 clamps the position into the bounce box at c 25, velocity in x0/y0; StopSound(0x1F) twice at c 430).
- EnemyUpdate hooks after the despawn check (by type, active not checked except where noted): 0x05 → BossScript(2);
  0x20 every 3rd tick: per active player, if Direction8(head → jet) = Direction8(old → new head position) →
  FireAllGuns(player, i); t mod 3 = 0: SpriteN := 0x3D8 / 0x3E0 / 0x3D0 + Direction8(movement) for 0x20 / 0x21 /
  0x22; 0x3C → BossScript(1); active 0x3D / 0x46: SpriteN := 0x4D1 / 0x4FC + Direction8(turret → nearest jet).
  "Old position" = SpriteX/Y read before the scroll adjustment.
- BossScript(action) @0x122C3 by level (records: enemy i at DS:0x7C68 + 38·i): level 1 action 5 hit sounds;
  level 2: 1 = sound 0x12 ×3, Quake(40), core (record 3, if type 5) layer 0, sub 8, phase 0, c 0, x0/y0 := its
  position, record 1 (if 0x0C) layer 0; 2 = record 2 (if type 0x0D) at core + (−10, 20), record 1 (if 0x0C) at core
  + (16, 46) (type checks only, so the 0x0C wreck keeps following); 5 = hit sounds. Level 3 action 1: k = last
  record of the active 0x21 run from record 2; if record 5 is an active 0x22 it takes k's angle and phase; k: x0/y0 :=
  position, energy := Random(320), c := scrollY + Random(200) (+1 if equal to SpriteX), KillEnemy(k, explode 1,
  drop 0) (which zeroes the energy: spec §12 #7), sub := 0x13. Level 4 action 1: records 1–4 at core (record 5) +
  (28, 63), (71, 63), (38, 24), (48, 17). Level 5: nothing. Level 6 (Golem = record 2): 1 anim 0x24, sound 0x36 ×3;
  2 anim 0x25, sound 0x37 ×3, x := Random(240) − 60, y := scrollY − 50 + Random(70); 3 Quake(60), (6, 7, 0xE) ×3,
  anim 0x26, rocks SpawnEnemy((i − 1)·100 − 40 + Random(80), scrollY − 40, 0x49, 0x28) i = 1..3; 4 curse (below);
  5 t > 210 ∧ Random(6) = 0 → sound 0x38 + Random(2) ×2; 6 sound 0x39 ×3, anim 0x28; 7 sound 0x3A ×2,
  SpawnEnemy(x − 50, y + 215, 0x4A, 0x29); 8 anim 0x2B.
- Curse (level 6 action 4), per player: inventory bytes (0x550A / 0x550E) := 0 and their HUD slots 9–11 / 12–14,
  selection frame slot 15 / 16, selection 0x5528 / 0x552A := 0; every mount with +3 set: +3 := 0, and for cat 2 or 6
  the pod sprite := 0 and Explode(podX + 7, podY + 10, 0x19, high) — P2's branch reads the positions from P1's slot
  list 0x7542 (spec §12 #8); then mount 2 +3 := 1, +4 := 1 (0x54B9/0x54BA, P2 0x54E9/0x54EA).
- Quake(n) 1d9e:1447: DS:0x25A5 := n and PlaySound(14). Explode kind 15 calls Quake(40); UseBonus 6 plays 14 and
  then Quake(50) (two plays).
- KillEnemy: type 0x0D → BossScript(1); type 0x48 → SpriteN := 0x535, sub 0x2A, t := 0 and nothing else (it stays
  active: spec §12 #18); every other type clears sprite, shadow, active, wreck and energy. EnemyDestroyed: type 0x21
  → energy := DS:0x1966[0x21] (no two-player bonus, spec §12 #19), BossScript(1), no KillEnemy.
- EnemyFire: pattern 7 → +9/+B := start + Round(50·cos/sin(t·8·π/360)) (4t°, (0x86, 0x4800) = 50); pattern 22 → +5
  := SpriteN − DS:0x19FA[type]; kind 0xFF uses gun 4's offset (class·8 + 0x1E84 / 0x1F8C) whatever gun fired.
- MoveEnemyShots: 6 → +5/+7 := position, +9/+B := centre of the jet Nearest(2, shot centre) names, then MoveTowards;
  7 → MoveTowards with the fire-time target; 17 → +9 −= 2, x = 09EE(sx, 200, +9 + 90), y = 0A6A(sy + 200, 200, +9 +
  90); 19 → `if +9 = 1 then +B := 2`; y += +B; `if +9 mod 8 = 0 ∧ +B < 9 then +B += 1` (+9 is never advanced, so
  +B grows every tick; I: a counter was intended); 21 → +9 += 1, position = record 4's sprite + (13, 37), KillEnemyShot
  when +9 > 23; 22 → by +5: 0 (0, −s), 1 (s−2, −(s−2)), 2 (s, 0), 3 (s−2, s−2), 4 (0, s), 5 (−(s−2), s−2), 6 (−s, 0),
  7 (−(s−2), −(s−2)).

## Main menu, hangar, options (session 8)

Addresses linear (seg 0x1000 main, 0x1D9E game unit, 0x28BE AniVGA). O = observed in code, I = inferred.
Sprite slot arrays: SpriteN DS:0x3146+2·slot, SpriteX DS:0xC2F0+2·slot, SpriteY DS:0xCA22+2·slot. Lower slot = in front.

### Shared helpers (O)
- `1d9e:2A7E Frame(ep)` = SpriteCycles(ep) (1d9e:3105, ep 0 = global cycles only) + sprite-cache load (1d9e:2F7C, XMS paging, no
  remake equivalent) + AniVGA Animate (28be:2CEF). Every menu loop iteration calls it once: the cycle counter DS:0x5530 +1 per call.
- `1d9e:2754 SpriteWidth(n)` = record width field ×4 (= full sheet width in sprites.json, multiple of 4).
- `1d9e:2E58 MakeText(n, s)` = AniVGA MakeTextSprite (28be:1FC5) with the current font; text sprite width = text px rounded up to 4 (I).
  Font colours: DS:0x25B9 = ink, DS:0x25BA = background; equal → transparent background (O, 28be:2420/2755).
- `1d9e:098A FadeIn(style, steps)` (Pascal order). Every menu call is FadeIn(0, 20): palette := black, Frame(0), then AniVGA Fade
  28be:027F from black to the target palette DS:0x4140 in 20 retrace steps (≈0.29 s). (Ghidra prints the args reversed.)
- `1d9e:0907 FadeOut(waitMouse, steps, x)`: if waitMouse, wait until no mouse button; palette → black in `steps` steps; Frame(0).
  Menus use FadeOut(1, 20, 0); program exit uses FadeOut(0, 10, 0).
- `28be:5411 LoadPic(name)` → background page; `28be:0389 LoadPal(name, dst)`; `28be:01F6 SetPalette(pal, 1)`; `28be:1B75 LoadFont`.
- `1000:C06E PointerToMouse(slot 1)`: INT 33h fn 3; SpriteX[1] = mouseX div 2, SpriteY[1] = mouseY (also DS:0x5516/0x5518 = x/2, y).
- `272c:011B MouseDown` = left OR right OR middle held (level, not edge). `1d9e:3605 AnyKey` = last port-0x60 byte is a make code (1..0x80).
- `1000:C0A9 ClearScreen`: all 920 slots := 0, scroll 0/0, AniVGA window reset.
- Keyboard ISR 1d9e:362E sets/clears held flags: 6C30 Esc, 6C2C Enter, 6C2F Space, 6C2A Up, 6C2B Down, 6C28 Left, 6C29 Right,
  6C2D Ctrl, 6C2E Alt, 4440 P, 6C31 kp−, 6C32 kp+, 6C39 PgUp, 6C3A PgDn, letters 6C33 G 6C34 E 6C35 D 6C36 A 6C37 N 6C38 K.

### Main menu (DrawMainMenu 0x1D60E + loop in entry 0x1D7C0) (O)
- Setup: CDPlay(2) if CD on; clear 920 slots; Frame(0); items i=1..6 in slots 13+i: sprite 613+11(i−1) (REST.LIB: Neues Spiel,
  Spiel laden, Die Geschichte, Spielanleitung, Horse Productions(=About), Exit); x = 160 − SpriteWidth(base)/2, y = 26+25(i−1),
  item 1 y −3. → (x,y): 1 (92,23) 2 (100,51) 3 (84,76) 4 (92,101) 5 (76,126) 6 (140,151). Selected item = 1: its sprite := base+1.
  Background HMBILD.PIC, palette HMBILD.PAL, FadeIn(0,20). Slot 1 (pointer) has sprite 0 → no visible pointer.
- Selected-item animation: sprite cycles (global table) [base+1, base+10] rate 2 → frames base+1…base+10 then back to base+1
  (cycle counter mod 2 = 0). Deselect sets the sprite back to base (unanimated frame); the new selection gets base+1.
- Loop per iteration: CDRepeat; PointerToMouse; Frame(0); input; Delay(15).
  Up held → PlaySound 12 (GRLASER), Delay(100), selection −1 (1 → 6 wraps). Down → sound 12, Delay(100), +1 (6 → 1).
  Held keys auto-repeat each iteration (~115 ms + draw). Enter or Space → sound 16 (DROHNE3), Delay(100), then:
  1 new game: P2 off (DS:0x25A0 := 0), InitPlayer(1) (0x1B2E3), level 1, episode var 0 → hangar 0x1D095 → DrawMainMenu.
  2 load: 1d9e:05D9; on success → hangar → DrawMainMenu.  3 Story: CDPlay(3), TextViewer(story.txt, raster.pic, 0, 1, 261, 1, 0, 150).
  4 TextViewer(anleit.ung, raster.pic, 0, 1, 288, 3, 0, 0). 5 TextViewer(about.txt, raster.pic, 1, 1, 199, 1, 0, 80). 3–5 then DrawMainMenu.
  6 quit. Afterwards: wait until no mouse button.
- Esc held at the top of an iteration → quit at once (no confirm): FadeOut(0,10,0), shutdown 1d9e:3A15, exit.
  Quirk (I): Esc still held when returning from the hangar (its Esc only waits for the mouse) quits the program.
- Mouse cannot select or confirm in the main menu (only Enter/Space).
- Timing (I): one iteration ≈ 15 ms delay + draw (≈50–60 Hz on the reference machine); cycle rate 2 ⇒ ~25 frames/s for the glow.

### Hangar / game menu 0x1D095 (setup 0x1CE10) (O)
- Setup (also re-run after shop, options and each level): FadeOut(1,20,0); clear slots; slot 1 pointer sprite 612 (8×11 arrow);
  slot 20 = 579 at (87,96); slot 21 = 589 at (242,102); slot 22 = 599 at (230,7); slot 23 = 610 (P2 not joined) / 611 (joined)
  at (24,134). LoadPic UMBILD.PIC; font _BROADWA.FNT (mono 9×16), ink 4, bg 4 (transparent); LoadPal UMBILD.PAL; FadeIn(0,20).
  Then loop (pointer + Frame + Delay(15)) until no mouse button. CD music is not changed here (track 2 from the main menu keeps playing).
- Hotspots (x = mouseX/2, y = mouseY, inclusive, DS:0x98E+8i: x1,y1,x2,y2), labels DS:0x917+0x15i:
  1 (92,110)-(185,154) "Shoot em all"; 2 (245,111)-(320,154) "Shop"; 3 (20,126)-(76,170) "Multiplayer";
  4 (228,18)-(312,58) "Optionen"; 5 (77,175)-(282,200) "Zurück zu Hauptmenu".
- Per iteration: PointerToMouse; cheat check; Frame(0); Delay(15); for i=1..5 if pointer inside: label text sprite 817 in slot 3,
  x = 160 − width/2, y = 180; on entering 1 or 2: StopSound(47) if playing, PlaySound 47 (DOORUP); entering 4: same with 22 (ALARM01).
  If any mouse button is down → PlaySound 21 (LRM003B) and run the item. No hover → slot 3 sprite 0. Leaving 1/2 (or 4) plays
  47 (or 22) again the same way. Door anims: every 5th iteration (DS:0x552E mod 5) slot 20 steps toward 588 while 1 is hovered,
  else back toward 579; slot 21 likewise 589↔598 for 2; slot 22 steps every iteration 599↔609 for 4. AnimTick (1d9e:33FA); DS:0x552E+1.
  Esc held → leave: FadeOut(1,20,0), return to the main menu (DrawMainMenu).
- Items: 1 Shoot em all: TextViewer(missions.pas, raster.pic, 0, from, to, 2, 0, 0) with lines per level (DS:0x910):
  L1 1–14, L2 16–30, L3 32–47, L4 49–64, L5 66–79, L6 81–96; episode := (level−1) div 3 + 1; FadeOut(1,20,0); GameSetup 1d9e:0000;
  StartLevel(0x1B582, level name DS:0x932+256·level); LevelStartSprites 0x107F8; engine sound 5 / 49 loops (spec §9.2);
  LoadPal Epis1.pal + SetPalette directly (the level starts at full brightness, no fade-in); game loop 0x1B787.
  Completed → ClearScreen, TextViewer(missions.pas, raster.pic, 0, 98, 119, 1, 0, 130), WriteEndVideoBat, shutdown/exit.
  Else CDPlay(2) if CD on; ClearScreen; unless aborted/game over (DS:0x3E05) re-run setup; aborted/game over → loop ends → main menu.
  2 Shop: FadeOut(1,20,0); shop 1d9e:84BC; ClearScreen; setup.  4 Optionen: FadeOut(1,20,0); options; ClearScreen; setup.
  5 Zurück: same exit as Esc.
  3 Multiplayer, P2 not joined: label "Verstärkung? Enter=Ja, Rest=Nein" (slot 3, y 180), Frame, Delay(15), then busy-wait
  (no redraw) for any key; if Enter is held: DS:0x25A0 := 1, InitPlayer(2) (0x1B2E3), slot 23 := 611, Frame. Any other key: no.
  Joined: label "Zurückschalten nicht möglich!", Frame; wait until no button and no key, then until a button or key, then release.
- Cheat (0x1CF34, counter in the hangar frame, starts 0): on each key make, the expected letter of G,E,D,A,N,K,E (by held flag)
  advances it, anything else resets it to 0 (G restarts at 1); each key waits for release (with Frame + Delay(15)).
  At 7: P1 money (DS:0x18F2) and P2 money (DS:0x18F6) := 666666 (also for an inactive P2), PlaySound 20 (AIDBONUS) twice.
- Nothing about the player (money, level, lives) is shown in the hangar.

### Options 0x1C4CD (setup 0x1C443, lines 0x1C168, cursor 0x1C10B) (O)
- Entered after the hangar's FadeOut. LoadPic OMBILD.PIC; font _BROADWA, ink 0x1F, bg 0x1F (transparent); clear slots; Frame;
  draw lines; cursor; LoadPal EPIS1.PAL; FadeIn(0,20).
- Lines i=1..6: text sprite 817+i in slot 2+i at x 70, y 40+20(i−1). Texts (no space before control names):
  "Steuerung Player1:" + Tastatur|Maus|Joystick (DS:0x502+256·ctl), "Steuerung Player2:" + same, "CDSound:" + " an"/" aus",
  "SoundEffekte:" + " an"/" aus", "CPU:" + " 486"/" Pentium"/" Pentium II"/' "Cray"', "Menu verlassen".
  Redrawing all lines does Frame + Delay(15) per line.
- Cursor: slot 12 sprite 556 (REST star; global cycle 556…565 rate 4) at x = 70 − 51 = 19, y = 30 + 20(line−1). Start line 1.
- Loop: PointerToMouse (no pointer sprite) ; Frame(0); Up/Down (held) → sound 12, Delay(100), line ∓1 wrapping 1↔6.
  Esc → leave. Enter, Space, or Right (not on line 6) → sound 16, Delay(100), then:
  1/2: control +1 (3 → 1), skipping the other player's value; redraw; wait for key release (with Frame + Delay(15)).
  3: CD off → on only if a CD drive was found (DS:0x3E20), then CDPlay(2); on → off and StopCD (2628:0194); wait release; redraw.
  4: SFX toggle (on only if a sound card was found, DS:0x3E1D); redraw (no release wait: held Enter keeps toggling every ~115 ms).
  5: CPU 1→2→3→4→1; redraw (no release wait). 6: leave. After any action: wait until no mouse button. Delay(15) per iteration.
- Leave: write SETTINGS.DAT (0x1AA85; format already in docs/file-formats.md), return to the hangar (ClearScreen + setup).

### Pictures and palettes (O, from the literals next to each LoadPic/LoadPal)
HMBILD.PIC + HMBILD.PAL (main menu); UMBILD.PIC + UMBILD.PAL (hangar); OMBILD.PIC + EPIS1.PAL (options);
RASTER.PIC + EPIS1.PAL (text viewer, literal 0x1C7DC next to Super.fnt 0x1C7E6 — I, verify in the viewer). PIC files have no palette.
REST.LIB sprites 579–613 and the menu items are drawn with the screen's palette, so preview sheets rendered with EPIS1 look wrong.

## Text viewer, mission briefings, ending text (session 8)

Evidence: REA pseudocode `ev_d52e5fec…` (TextViewer 0x1C7F2), `ev_b822bd25…` (DrawPage 0x1C6CF),
`ev_420dccbb…` (MakeTextSprite 1d9e:2E58); objdump of seg 0x1000 / 0x1D9E / AniVGA 0x28BE (session-8 scratch, not kept).
Literal addresses are linear (file offset = lin − 0x10000 + 8608). O = Observed, I = Inferred, U = Unknown.

### TextViewer @0x1C7F2 (near, main program)
Pascal signature (O, push order at the call sites; Ghidra lists the params reversed):
`TextViewer(fileName, picName: string; centred: boolean; firstLine, lastLine, mode, picTable, frameDelay: integer)`

| Caller | file | pic | centred | first | last | mode | picTable | delay |
|---|---|---|---|---|---|---|---|---|
| Main menu 3 Story @0x1D932 (after CDPlay(3)) | story.txt @0x1D73F | raster.pic @0x1D749 | 0 | 1 | 261 | 1 | 0 | 150 |
| Main menu 4 Anleitung @0x1D95D | anleit.ung @0x1D754 | raster.pic | 0 | 1 | 288 | 3 | 0 | 0 |
| Main menu 5 About @0x1D989 | about.txt @0x1D75F | raster.pic | 1 | 1 | 199 | 1 | 0 | 80 |
| Game menu "Shoot em all" briefing @0x1D294 | missions.pas @0x1D034 | raster.pic @0x1D041 | 0 | [DS:0x910+4·lvl] | [DS:0x912+4·lvl] | 2 | 0 | 0 |
| Ending after level 6 @0x1D36E | missions.pas | raster.pic | 0 | 98 | 119 | 1 | 0 | 130 |

Briefing line table (O, DS:0x914…): L1 1–14, L2 16–30, L3 32–47, L4 49–64, L5 66–79, L6 81–96
(= MISSIONS.PAS blocks "MISSION n:" … last text line).

#### Setup (O, 0x1C826–0x1C8B3)
1. SpriteN[1..920] := 0 (all sprites cleared).
2. `FadeOut(style 0, 20 steps, waitMouse 1)` 1d9e:0907: wait until mouse buttons are released, palette → black in
   20 steps (AniVGA Fade 28be:027F, ≈ 0.29 s), then Animate once while black.
3. Assign/Reset the text file (TP Text, `ReadLn` into string[255]; CR/LF lines, no control codes in any of the files).
4. `LoadPalette('epis1.pal' @0x1C7DC)` → DS:0x4140, SetPalette at once (I: a brief flash of the old screen in EPIS1
   colours until the fade-in blacks it out again; the remake can skip it).
5. LoadPicture(picName) = **RASTER.PIC with the EPIS1 palette** (no own palette).
6. LoadFont('Super.fnt' @0x1C7E6): SUPER.FNT, mono 8×8, every glyph 8 px wide (fixed pitch). Glyph index = CP437 byte.
7. Text colours: FontColor DS:0x25B9 := 0x1E (EPIS1 #30 = RGB 244,244,244), FontBack DS:0x25BA := 0.
   AniVGA text-to-sprite (28be:1FC5 ≈ 0x2A3A0): set bit → FontColor; clear bit → 0 if FontColor = FontBack, else
   FontBack. Here FontBack = 0 = transparent, so text is plain near-white with transparent background (O).
8. `FadeIn(style 0, 20)` 1d9e:098A: black palette, Animate, fade to DS:0x4140 in 20 steps.
Constants (O, typed consts never written): DS:0x902 = 5 (top margin), DS:0x904 = 5 → **line pitch = 0x904 + 6 = 11 px**.

Text lines are text sprites: `MakeTextSprite(sprite, s)` 1d9e:2E58 (AniVGA 28be:1FC5, reuses the load slot per
sprite number); an empty line becomes " " (@0x1C7F0 / @0x1C6CD). Sprites 0x317+i (791…811) in slots 24+i.
Clip window: the viewer doesn't set one. It's full screen (0–319) whenever ResetScreen 0x1C0A9 (SetAnimateWindow
0,0,319,199) or the startup has run (I). Lines start at x = 10, so 39+ char lines (STORY has 40/41-char lines,
ABOUT 47 but centred) run past x = 319 and are clipped at the screen edge (I, check in DOSBox-X).

#### Mode 1: auto-scroll credits style (Story, About, Ending)
- Skip firstLine−1 lines; line counter C (DS:0x906) := firstLine; frame counter f := 0; ring index r := 0.
- Each frame (O): f += 1; CDRepeat; every text slot 24…44 with a sprite: y −= 1 (scroll 1 px/frame);
  if f mod 11 = 0: if C ≤ lastLine { r := (r+1) mod 20 (1..19,0,…); read the next line; sprite 791+r at y = 200,
  x = 10 (centred = 0) or 160 − TextWidth div 2 (centred = 1; 28be:1F37, I: = 8·length) }; C += 1 regardless.
  Then Delay(frameDelay ms); DrawFrame 1d9e:2A7E (sprite cycles + Animate).
- Ends when C > lastLine + 20 (the last line has scrolled 220 px, off the top) or a key is down
  (KeyDown 1d9e:3605 = port 0x60 holds a make code 1…0x80: **any keyboard key, mouse doesn't count**).
- Duration: 11·(lastLine − firstLine + 21) frames; one frame = frameDelay + draw time (U: ≈ a few ms in DOSBox-X).
  Story 3091 frames × ≈ 150 ms ≈ 7.7 min; About 2409 × ≈ 80 ms ≈ 3.2 min; Ending 462 × ≈ 130 ms ≈ 60 s.
  Remake at 40 Hz: 1 px every round((delay + ~5 ms)/25 ms) ticks, i.e. Story 6, About 3–4, Ending 5–6 ticks/px (I).
- picTable: an unused leftover. Each frame it checks 4 entries (sprite at DS:0x900+6·t+2i, trigger line at
  DS:0x906+6·t+2i, slot 44+i at (200,200), moving up) for "picture sprites appear at line N"; for t = 0 (every
  caller) the triggers are lines 623/613/643 and are never reached. The remake ignores it (O table, I purpose).

#### Mode 2: mission briefing (static page with slide-in)
- Skip firstLine−1 lines; for i = 1…20: read a line; text = " " if empty or C > lastLine; sprite 791+i in slot 24+i,
  **y = 11·i** (0x904+6)·i + 0x902 − 5; x = −340 for odd i, +360 for even i (s·350 + 10, s alternating −1/+1).
- Delay(13); PlaySound(47 DOORUP); 50 frames: odd lines x += 7, even lines x −= 7 (all reach x = 10),
  DrawFrame, Delay(13). ≈ 50 × (13 ms + draw) ≈ 0.8 s → remake 50 frames ≈ 25–32 ticks or keep 50 ticks at 40 Hz (I).
- Then loop: DrawFrame; Delay(20); CDRepeat; until any key is down. Briefing lines are ≤ 16, so y ≤ 176 (all visible).
  The mouse can't dismiss it (KeyDown only); the game menu reached it by a mouse click.

#### Mode 3: manual pager (Anleitung)
- C := firstLine (1). DrawPage 0x1C6CF: re-reads the file from the start, shows lines C…C+20 at x = 10,
  y = 11·k + 5 (k = 0…20); rows k ≥ 18 lie below y 200, so **18 visible lines** (y 5…192).
- Each frame: CDRepeat; keys (held-state flags from the keyboard ISR 1d9e:362E; O mapping below):
  Down (scan 0x50 → DS:0x6C2B): if C + 18 < lastLine then C += 1 → max top line 270 (shows 270–287);
  Up (0x48 → 0x6C2A): if C > firstLine then C −= 1; Left 0x4B (0x6C28) or PgUp 0x49 (0x6C39): C −= 18 (min 1),
  Delay(150); Right 0x4D (0x6C29) or PgDn 0x51 (0x6C3A): C += 18, if C + 18 > lastLine then C := lastLine − 18,
  Delay(150). Any of these redraws the page. Then DrawFrame; Delay(15).
- Ends on Enter (0x1C → 0x6C2C) or Esc (0x01 → 0x6C30) (held state).
  Held Up/Down scroll one line per frame (≈ 15 ms + draw + file re-read); remake: 1 line/tick (I).

#### Exit (all modes, O)
Wait until no key is down (Delay(10) polls), Close the file, FadeOut(0, 20, waitMouse 1). The caller redraws its own
screen (main menu: DrawMainMenu 0x1D60E → CDPlay(2) again; FadeIn). Quirk (I): the viewer is entered with the
confirm key (Enter/Space) still possibly held; mode 1/2 exit as soon as a key is down and mode 3 on held Enter, so a
long press can skip the screen. The remake should require a fresh key press after the fade-in.

### Briefing in the "Shoot em all" flow (O, game menu 0x1D25F–0x1D341)
PlaySound(0x15) on the click (@0x1D24F, I: menu click sound) → TextViewer(missions.pas, mode 2, level lines) →
episode := (level−1) div 3 + 1 → FadeOut(0,20,1) (already black) → 1d9e:0000 (setup) → StartLevel(levelfile) →
LevelStartSprites 0x107F8 (loads **fire.fnt** @0x107EF) → engine sounds 5/49 → LoadPalette('Epis1.pal' @0x1D04C) +
SetPalette **without a fade-in** (the level appears at once) → game loop 0x1B787.

### Ending (O, 0x1D344–0x1D377)
If DS:0x6C53 (game completed): ResetScreen 0x1C0A9 (clear sprites, scroll 0/0, SetAnimateWindow(0,0,319,199), Animate)
→ TextViewer(missions.pas, raster.pic, not centred, lines 98–119, mode 1, delay 130) → WriteEndVideoBat 0x1AC74 →
Shutdown(0) 1d9e:3A15 (restores the system, prints the message for a non-zero code, then Halt). DPMAX.BAT then plays
CD track 9 + ENDING.TXT (FLIs). Lines 120–126 ("übrigens: Hast du den Cheat schon entdeckt?") are never shown
(last = 119). The music during the ending text is whatever DS:0x3E03 holds, kept looping by CDRepeat: track 8 from
StartBossFight's CDPlay(8) (I). Any key skips the text.

### Fonts (O): there is no font table; one "current font", loaded where needed (AniVGA LoadFont 28be:1B75)
- fire.fnt: LevelStartSprites @0x10803 (HUD money/lives).
- Super.fnt: text viewer @0x1C89D (story, manual, about, briefings, ending).
- _broadwa.fnt: Options @0x1C45F (colours 0x1F/0x1F) and the game menu draw @0x1CEB7 (colours 4/4; its status text
  sprite 0x331 at y 180, centred). Out of scope here; for the hangar fork.
- default.fnt: shop 1d9e:84E5 (colours 0x1C/0x1C).
- Main menu: colours 2/2 but its items are pre-drawn REST.LIB sprites, not text.
FUN_1000_af0f (startup) loads no font. Mono fonts take FontColor/FontBack as above; the multicolour FIRE font uses its
own pixel colours (I, from the second branch @28be:2755; not needed here).

### Other text screens on this path
- "Loading..." is written in text mode by the main body before the graphics start (O); then text-mode progress
  strings ("XMS initialisieren...", "Sounds laden...", "Sprites laden...", "Gamesettings laden...", per session-2 notes).
- No level-title screen: StartLevel runs straight after the briefing (O).
- Shutdown messages (1d9e:3908…, O): "Keine Soundkarte gefunden!", "Zuwenig konventionellen Speicher!",
  "Palettedatei nicht vorhanden!", "IOResult Fehler trat auf!", "Fehler beim XMS-allokieren",
  "Na du kleines Schlitzohr, so läuft das aber nicht! / Da musste schon früher aufstehen, um den Saveschutz /
  übers Ohr zu hauen!!!" (save-file tamper check).

### Unknown / to check in DOSBox-X
- Real frame time of the viewer loops (Delay + Animate) → scroll speed of Story/About/Ending.
- Whether 39–41 char lines are clipped at x = 319 (expected) or wrap.

## Shop screen and load/save (session 8; implemented and extended in session 9)

Evidence: Ghidra pseudocode of 1d9e:84BC (`ev_08cdf79d…`) plus CLI decompiles of every 1d9e helper
(decompiles), objdump of the whole image (session-8 scratch files, not kept; the shop's action dispatch
0x26141–0x261E5 was dropped by Ghidra as "unreachable" and is read from the disassembly).
Layout check (session-8 scratch render, not kept): sprite 501 on RASTER.PIC with every hit rectangle drawn; all line up.
Slot arrays: SpriteN DS:0x3146+2s, SpriteX DS:0xC2F0+2s, SpriteY DS:0xCA22+2s; draw-mode byte DS:0xB820+s.
Coordinates are 320×200. The mouse driver x is halved (mouse x 0..639 → 0..319), y is used as is.
Labels: O = Observed in code, I = Inferred.

### Screen setup (O, 84BC)
- If a mouse button is still held on entry: Crt Sound(500 Hz), Delay(500), NoSound (PC-speaker beep, 3BC9).
- Font `default.fnt` (6×6 mono; AniVGA 28be:1B75), background `raster.pic`, palette `Epis1.pal`, fade in
  20 steps (28be:578A(20)). Scroll 0/0, all sprite slots cleared, clip 0..319 × 0..199.
- Text colour: DS:0x25B9 = DS:0x25BA = 0x1C, so fg = 0x1C (EPIS1 RGB 228,228,228) with a transparent background
  (AniVGA draws bg only when 25B9 ≠ 25BA, @0x2B009). Text sprites are built by 1d9e:2E58(spriteNo, string).
- Static sprites: slot 64 = **501** (the whole 316×196 panel) at (3,3). Pointer: slot 1 = **495** (arrow 8×11)
  and slot 2 = 496 (4×1) both at (mouseX/2, mouseY), updated every frame.
- Player number text sprite 849 (slot 45) at (76,122) = "1"/"2" right of the PLAYER button.
- Money text sprite 837 (slot 23), centred at x 124 (x = 124 − w/2), y 122. Same sprite number as the HUD money.
- Category name text sprite 840 (slot 3), centred x 94, y 141: "Kleine Pods", "Grosse Pods", "Boni",
  "Antriebe", "Schilde", "Kugel Pods", "Jets" (literals 1d9e:3C1C…3C55; cat 1..7).
- Mode frame slot 33 = **506** (32×19 yellow frame) at (160 + 40(mode−1), 130).
- Initial state: mode 1 (KAUFEN), category 2 (Grosse Pods), page 0, no selection; info box shows SPEZIAL3.
  Current player DS:0x9BF = 1 if P1 active, else 2.

### Main loop (O)
Per iteration: CDRepeat, pointer update, click cooldown DS:0x9BE (10 iterations after each handled click),
mode-button cooldown DS:0xA26 (7 after a mode change), cycle anims (33FA; nothing in the shop starts one),
Animate, Delay(15). A click (any button, 272c:011B) when the cooldown is 0 runs, in order:
1. Money exchange button: x 145..177, y 101..119 ("GELD AUSTAUSCH") → 6A7E.
2. Player switch: x 43..83, y 120..130 ("PLAYER"), only in a two-player game (DS:0x25A0): switches to the
   other player if active (sound 22 ×2), else SPEZIAL16 + sound 23 ×2. Then redraw jet/offers.
3. Mode buttons (7007), i = 1..4: x 160+40(i−1) .. 188+40(i−1), y 130..148: 1 KAUFEN, 2 VERKAUFEN,
   3 POSITION WECHSEL, 4 HAUPT MENU. Clicking a different mode: sound 22 ×2, frame 506 moves, header cleared;
   mode 1 → page 0, rebuild offers, SPEZIAL3; mode 2 → hide offers (6556), SPEZIAL2; mode 3 → hide offers,
   SPEZIAL10, highlight frames. **Mode 4 exits the shop at once.**
4. Mode 1: category arrows (6F7C): left x 36..50, right x 136..150, y 136..149, wrap 1..7 (sound 22 ×2);
   offer boxes (67A0); clicking the KAUFEN button again (5311, same rect, cooldown A26 ≤ 0) → Delay(130), buy (75BE).
   Mode 2: a click not on VERKAUFEN selects a mounted item (5373); then if the selection is sellable (5165) and
   the click was on VERKAUFEN → sell (5558).
   Mode 3: click selects a position (5373); if it holds a large pod → swap UI (811F).
Exit: write back the edited player record, DS:0x9BF := 1, wait for button release, clear DS:0xB820 modes.

### Offer list (O, 6216 / 5D66 / 67A0)
- Offers: up to 20 (cat, id) per category sorted by price (rules in spec §10). 5 boxes per page, i = 1..5.
- Box i: frame area x 56i−34 .. 56i+17, y 163..188 (click rect). Empty entry: **503** (TV-noise 52×27) at
  (56i−34, 161) and empty price text.
- Item sprite (slot 12+i) at x = dxCat[cat] + 56i + ofsX(cat,id), y = dyCat[cat] + ofsY(cat,id) + 163;
  dxCat (cat 1..7) = −15,−13,−21,−15,−17,−17,−17; dyCat = 0,0,−2,0,0,0,−1 (DS:0xA11/0xA19).
  ofs (ItemInfo fields 11/12): small, large, shield (1,1); engine (0,0); boni (DS:0x1795[id] = 1,5,3,5,4,4,4,5,5,0,5; 1);
  ball pods (3,2),(1,1),(1,1); jets dx −3,−2,−1,−2,0, dy 0.
  Sprites: small 507,517,509,508,171,510,534; large = in-game pod sprites 43,49,62,56,58,69,74,81,87,94,139;
  boni 393,410,418,435,439,443,447,453,459,464,484; engines 512,530,542; shields 511,519,543; ball 110,100,120;
  jets 537,538,539,541,540; standard weapons by jet 516,507,518,171,518.
- **Unaffordable** (price > money): a second copy of the sprite in slot 7+i with draw mode 3 (DS:0xB820 = shadow
  mode, the same as enemy shadows) over it → I: shown darkened. Clicks on it are ignored (no sound).
- Price text sprite 840+i (slots 18..22), centred x 56i−7, y 190.
- Page arrows: right x 301..312, y 159..192 (only if entry page+6 exists), left x 7..19 (page > 0): page ±5,
  selection cleared, sound 22 ×2.
- Selecting box i: frame **502** (52×29) in slot 24 at (56i−34, 161), info text (THEMA=cat, ART=id), header
  (icon + price), sound 21 ×2. Session 9 correction: 67A0 only calls 660A for a box with an affordable item, so
  clicks on empty or unaffordable boxes do nothing (660A's sound-23 branch is unreachable from there).

### Info box and header (O, 4366 / 4288)
- Texts from `Info.Pas` (read at runtime): `BEGIN THEMA<cat>` … `BEGIN ART<id>` … `END ART<id>`, or
  `BEGIN SPEZIAL<n>` … `END SPEZIAL<n>`. Max 18 chars × 6 lines (SPEZIAL1/3/16 have 7). Session 9 correction:
  line k (1..7) is text sprite 826+k (0x33A+k), slot 33+k,
  x 203, y 38 + 10k (48, 58, … 98). Missing ART → "Noch kein Text!" at (203,48) plus a PC-speaker beep
  (Sound(1000), Delay(100), NoSound).
- SPEZIAL texts: first the header (4288) with sprite **520** ("INFO", slot 31) at (233,15), no price.
- Item header: slot 31 = item icon at (250, 9) (session 9: 660A passes dx = dy = 0; only the SPEZIAL and EXIT
  headers use offsets) (shop sprite of the item); price text sprite 848
  (slot 32) centred x 257, y 36 (empty when 0). In sell mode the price shown is the refund (½, boni ¼, I from 0b9b).
- Messages used: 1 jet can't be sold; 2 sell help; 3 buy help; 4 no mount here; 5 "Gekauft"; 6 "Verkauft";
  7 all positions taken (waits for a click); 8 no ball pods on this jet (switching to Kugel Pods with the
  Firestorm); 9 placement help; 10 position-change help; 11 boni sell at ¼; 12 standard pod can't be sold;
  13 can't mount this; 14 max 2 of the same pod; 15 3 boni already; 16 partner is dead; 17 "Spiel gespeichert!".
- After a buy: SPEZIAL5 + line 2 = "Investiert:" + price (sprite 828, slot 35, (203,58)).
  After a sell: SPEZIAL6 + "Rückzahlung: " + refund (same sprite/position).

### Jet display (O, 5909) — positions table DS:0x9C2 (x) / 0x9D0 (y), index p:
p: 0 large(mount 0) (103,13) | 1 engine (101,77) | 2 small (84,18) | 3 standard (123,18) | 4..7 large mounts 3..6
(73,45) (133,45) (53,49) (153,49) | 8 ball (59,15) | 9 shield (13,15) | 10 jet (93,41) | 11..13 boni (10/38/66, 89).
- Jet sprite (slot 128) at (93 + 10 + jetDx, 41 + 3 + jetDy). Engine slot 46 at (101,77). Shield slot 47 at (14,16).
  Standard weapon slot 53 at (124,19). Mounts 0,1,3..7 → slots 51+m at (X[p] + ofsX, Y[p] + ofsY).
  Boni slots 48..50 at (X[11+k] + boniDx[id] − 1, 90).
- Highlight frames (4FC7): 497 (16×24) for large-pod positions, 498 (24×21) engine/ball/shield, 499 (16×18)
  small/standard, 505 (36×32) jet, 500 (28×26) boni; at (X[p], Y[p]). Buy mode shows them on every position of the
  category that the jet has (slots 27..31); sell/position mode shows one on the selected position (slot 31, which
  also holds the header icon, so the icon disappears: quirk).
- Category positions (DS:0x9E8): 1 small [2]; 2 large [0,4,5,6,7]; 3 boni [11,12,13]; 4 engine [1]; 5 shield [9];
  6 ball [8]; 7 jet [10]. Click rect per position: x..x+w, y..y+h with w = 9,16,19,19,19,23,34 and
  h = 17,22,19,19,19,24,30 by category (DS:0x9DD/0x9E5).

### Buying a large pod / position change (O, 75BE / 811F)
- Pointer becomes the pod's sprite (slot 1, slot 2 hidden), mouse window x 3..179, y 7..117, pointer set to (95,60);
  SPEZIAL9 shown. Right button cancels (buy) / only when nothing held (swap). Left click on a free valid position
  installs (pay, sound 22 ×2, "Gekauft"); an invalid one shows SPEZIAL4. Swap: clicking another large pod swaps
  it into the hand (Delay 200); an empty mount the jet has places it and ends. Afterwards the pointer and the
  window (0..638 × 0..199) are restored.

### Money exchange (O, 6A7E)
Only if both players are active (else sound 23). Panel **535** (slot 61) at (203,51); header icon **536** ("EXIT",
slot 31) at (231,7); mouse window x 200..312, y 4..119. P1 money text 837 centred x 231, y 62; P2 money 838
centred x 280, y 96; step text 811 (slot 25) at (240,79); step table 1/100/1000/9000, default 1000.
Rects (absolute): P1→P2 x 277..289, y 60..71; P2→P1 x 221..232, y 93..104; step up x 265..272, y 77..81;
step down y 82..86. Transfer moves min(money, step) (28be:58E6), sound 22; no money → sound 23 + Delay(100).
Ends on a click while the pointer touches EXIT (HitDetect slot 31 vs slot 1), sound 22, back to SPEZIAL3.

### Sounds
21 LRM003B select offer; 22 ALARM01 button/ok; 23 BMBLITZ error. Each is played twice back to back (I: louder).

### Load / save (O)
- Save (1d9e:0350) is silent; the shop pays the Save price, writes back the current player record, saves, shows
  SPEZIAL17 "Spiel gespeichert! Vertrau mir!!".
- Load (1d9e:05D9, main menu item 2): no SAVE.DAT (IOResult ≠ 0) → returns false, nothing shown, menu stays.
  Bad checksum → Shutdown(6): the program quits to DOS printing "Na du kleines Schlitzohr, so läuft das aber nicht!" /
  "Da musste schon früher aufstehen, um den Saveschutz" / "übers Ohr zu hauen!!!" (literals 1d9e:3998–39FF).
  Success → straight into the game menu (hangar).
Unknown: AniVGA 28be:0106(0x28), 50F2/5063(0) and DS:0x25C0 := 2 in the setup.

### Shop rules (session 9, O; decompiles of every 1d9e shop helper + objdump of the dispatch 0x8714–0x880F)
Locals of 84BC (via the frame link): mode −0x1B, category −0x19, page −0x1D, selected box −0x1A, selected
position −0x1C (20 = none), offers −0x5D + 3i (cat byte, id word), player record −0x9C … −0x86.
- **272c:00DC(mask)** is INT 33h fn 3 and BX AND mask: a button *held* (1 left, 2 right), not a press count.
  The 130 + 130 ms delays before a buy and the 200 ms after picking up a pod keep the click from repeating.
- **ItemInfo 3C5A(cat, field, id)**: field 1 price, 2 sprite, 3 id, 4 count (7/11/11/3/3/4/5), 11/12 offsets;
  side effect: copies the category name to DS:0x3E08. Index 0 of each price table is garbage (neighbouring
  data, e.g. 786440), which is what makes 6216's "cheaper than the current candidate" selection sort work.
  Save price: 4000 (DS:0x17CA) + 10000·min(level − 2, 4) (28be:58E6 = min).
- **Offers 6216**: 20 rounds; each picks the cheapest id with price > 0 and price > the previous pick
  (strictly, so equal prices drop out); jets only id > jet; boni only DS:0x1789[id] ≠ 0 (2, 5–9) or id 4 or 11.
  Ownership is not checked. Ends with the highlight frames of every position of the category (50A5).
  The original level-1 Save price (−6000) fails "price > 0", so Save isn't offered on level 1 at all.
- **Positions**: 47B8 item at p, 4A37 occupied (mount.occupied, or engine/shield/jet > 0, or bonus ≠ 0), 49EA
  exists (DS:0x18A4 + 8·jet + mount; non-mounts always), 48C8 p → mount (0 → 0, 2..8 → p − 1, boni 11..13 →
  slot 0..2), 4930(index, cat) the reverse, 4864 p → category, 5373 position under the pointer (also sets the
  category: after picking a position in sell mode, Kaufen opens that category).
- **4BE4 (pod compaction)**: if mount 6 is occupied and mount 4 free, the pod moves to 4; same for 5 → 3. Runs
  after buying a large pod, selling a mount and after a position change, so a pod placed outside a free inner
  mount slides inward.
- **Buy 75BE** (only if the offer exists and price ≤ money):
  large pod: 2 of the same mounted → SPEZIAL14; no free mount → SPEZIAL7 and wait for the left button; else the
  pod on the pointer (window x 3..179, y 7..117, pointer to (95, 60)), SPEZIAL9; left button on a free existing
  large position installs it (73CC: 7143 + pay + sounds 22 ×2), 4BE4, offers rebuilt, "Gekauft"; on another
  position SPEZIAL4; right button cancels. Boni: "1 Leben" lives + 1; "Save" pays, writes the record back and
  saves (0350), SPEZIAL17; others go to the first free bonus slot, none → SPEZIAL15. Jet: 5558 sells the current
  jet first (half price back, the "Verkauft / Rückzahlung" message stays), then 7143 sets the jet and mount 2 :=
  {reload 0, loaded, occupied, item = jet, cat 8}, pay, offers rebuilt (no "Gekauft"). Small pod, engine,
  shield, ball pod: the category's single position must be free and exist, else SPEZIAL13 (so an engine or
  shield must be sold before buying another). Every buy ends with the jet redraw 5909.
- **7143 install**: mounts only when free: {occupied, item, reload 0, loaded, cat}; boni slot := id; engine,
  shield, jet := id. 7504 shows SPEZIAL5 and line 2 "Investiert:" + price (no space).
- **Sell 5165 / 5558**: 5165 (every click in mode 2): nothing at the position → no; jet → SPEZIAL1, no;
  standard weapon → SPEZIAL12, no; boni → SPEZIAL11 then still yes; shows THEMA/ART (without clearing the box,
  so old lines can stay) and the header with the refund (price div 2, boni div 4), sound 22 ×2, one highlight
  frame (slot 31). A click on VERKAUFEN then sells: money += refund, the mount / slot / engine / shield := 0,
  4BE4 for mounts, boni shift left, SPEZIAL6 + "Rückzahlung: " + refund; afterwards the header and the frame are
  hidden (50A5 with hide = 1).
- **Position change 811F**: takes the pod off its mount (Delay 200), pod sprite on the pointer, same window.
  Left button on a large pod swaps (the other pod goes to the hand, Delay 200), on a free existing large mount
  places it and ends. The right button only ends with an empty hand, which never happens. Ends with 4BE4.
- **Money exchange 6A7E**: both records are written back first (player toggled twice). Level-triggered: while
  the button is held on an arrow, min(money, step) moves every pass (Delay 13), money ≤ 0 → sound 23 +
  Delay(100); step arrows Delay(200). The loop draws without sprite cycles (2F7C + Animate only). Slot 23 shows
  837 / 838 for the current player but is centred on P1's amount. On exit SPEZIAL3, slots 61–63, 25, 31 cleared,
  page and selection reset.
- **Main loop pass**: pointer; click cooldown 9BE −1; on MouseDown with 9BE = 0: exchange, player switch (then
  4C75(1), 5909, 6216 in mode 1), mode buttons, then per mode (1: arrows, offers, Kaufen → Delay(130) + buy;
  2: 5311 / 5373 / 5165 / sell; 3: 5373, swap if a large pod; 4: leave), 9BE := 10; A26 −1; AnimTick; Frame;
  Delay(15). Mode button rects x 160 + 40(i − 1) .. +28, y 130..148; 5311 = the current mode's button and A26 ≤ 0.
- **Load 05D9 / Save 0350**: read / write the globals in the SAVE.DAT order (file-formats.md); Load has no other
  side effects (the hangar's setup follows).
- **Remake (design)**: the browser can't move or confine the real pointer, so the mouse windows clamp the pointer
  sprite and the pointer jumps are dropped; the PC-speaker beeps are not reproduced; a bad SAVE.DAT checksum
  shows the Shutdown(6) message until a key and returns to the main menu.

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
- ~~Game tick rate~~: work + CPU-option delay per frame, 1 px scroll per frame, ≈ 41 fps at `cycles=64000` with CPU = Pentium II (see "Program structure").
- ~~Entity tables~~: decoded in session 4 ("Gameplay (session 4)"; data via `tools/enemy_table.py`).
- ~~LEV format and wave scripting~~: data-driven; `sub`, `DS:0x16C2`, boss fights resolved in session 4.
- ~~SFX sample rate~~: 11025 Hz, signed (session 3).
- ~~The cheat~~: typing G-E-D-A-N-K-E in the hangar sets both players' money to 666666 (session 4).
- ~~`SAVE.DAT` / `SETTINGS.DAT`~~: decoded in session 4 (`docs/file-formats.md`).
- Still open (need DOSBox-X): see `docs/gameplay-spec.md` §13 (draw order, on-screen shot speeds, shop bugs, boss details). Hit-test precision is answered from the code (session 5, "Engine tables").
