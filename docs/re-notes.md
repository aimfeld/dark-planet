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
  Autogun (cat 1 id 4), whose branch picks the target instead (spec §12 bug 4). Missile shots (cat 1 id 1) start
  anim 5. The mount is unloaded only if a shot slot was free.
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
- Data-table element sizes (all checked against the spec values by `tools/game_tables.py --check`): prices are
  longints (base + 4·i); jet frame base, shield recharge and ball-pod reload are words (the session-4 ledger did not
  give sizes).

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
