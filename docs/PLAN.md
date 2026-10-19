# Plan & progress

## Goals (from the user)
1. Easily shareable and cross-platform, probably as a browser version.
2. A **remastered** mode (higher-resolution graphics, smoother motion) and a faithful **classic** mode, switchable from the start menu.
3. Modern game libraries are fine.
4. Bonus: the original CD soundtrack playing.

## Architecture (confirmed by the user in session 3)
- **TypeScript + Vite + PixiJS (WebGL) + Web Audio.** Browser-first; host on itch.io or GitHub Pages; wrap with Tauri later if a desktop build is wanted. PixiJS was chosen over Phaser because classic mode needs tight control of the game loop.
- **One simulation, two renderers:**
  - The game logic runs on a fixed tick that matches the original, and is shared by both modes, so gameplay is identical.
  - *Classic*: a 320×200 indexed framebuffer with the original palette, sprites and 8-bit SFX, integer-scaled with nearest-neighbour filtering.
  - *Remastered*: the same state rendered at native resolution and refresh rate with interpolation between ticks, plus upscaled assets (AI upscaling baseline, hand-refined later), particles, bloom and lighting, and the CD soundtrack as OGG/Opus.
  - Keep the 320×200 playfield proportions in both modes, because widening it would change the gameplay.
- **Asset pipeline:** Python tools under `tools/` convert the original files into PNG atlases, JSON, OGG and WebM at build time. The user owns all assets.

## Phases
### Phase 0: Investigation & tooling ✅ (session 1, 2026-10-19)
- [x] Scan `original_source`. Main source is lost; prototype `SLYVERS.PAS` found.
- [x] Locate the soundtrack in the ISO (`docs/re-notes.md`).
- [x] Decode SND, PIC, PAL and FLI (`tools/extract_assets.py`).
- [x] Install Ghidra 12.1.4 + Temurin JDK 21 in `~/opt`, and register REA 6.7.0 as an MCP server for Claude Code.
- [x] Reverse-engineer `STARTAUD.EXE` completely (track = number of arguments).

### Phase 1: Original playable with music, plus asset pipeline 🔄
- [x] `tools/build_cd_image.py` → `original_source/Image/fixed/` (DATA.ISO + WAVs + CUE).
- [x] `original_source/dplanet-cd.conf` (mounts the CUE, runs `dpmax.bat`).
- [x] **User:** WAVs play fine (session 2). TRACK01 is the data track.
- [x] How DP.EXE calls `startaud`: it writes `endvideo.bat` with a fixed `startaud 1 2 3 4 5 6 7 8 9` when the game is completed, so the ending is **always track 9** (session 2).
- [x] Fix `TRACK_STARTS` (8 audio tracks, found by sample-exact repeat fingerprinting), rebuild the image, verify in DOSBox-X (`Playing track # 9`).
- [ ] **User:** play through `dplanet-cd.conf` and check the music: menu = track 2, levels 1–3 = tracks 5–7, boss = track 8, and tracks loop. Optionally confirm by ear that track 8 starts at 21:57 (1317 s) and not at 22:08.
- [–] ~~Fix DOSBox-X audio~~: **decision (user, session 2): not needed.** The target is the TypeScript version. In DOSBox-X the CD music plays fine with `dplanet-cd.conf` (confirmed by the user; an earlier choppiness came from a runaway analysis script loading the host CPU). Only the SFX are garbled (a known DOSBox issue; the user decoded the SFX correctly in Python before). Game speed is fine with `dplanet.conf`. DOSBox-X stays a reference for gameplay and visuals, not for audio.
- [x] SFX format verified in DP.EXE (session 3): signed 8-bit, 11025 Hz. `extract_assets.py` assumed unsigned 22050 Hz and is fixed.
- [x] **User:** corrected SFX WAVs sound right (session 3).
- [x] Decode AniVGA `.LIB` sprites → PNG sheets + `sprites.json` (`tools/extract_sprites.py`, numbers as DP.EXE loads them).
- [x] Decode `.FNT` fonts → PNG + widths (`tools/extract_fonts.py`).
- [x] **User:** sprite sheets, fonts and level renders match the game (session 3).
- [x] Decode `.LEV` (tile grid + 600 spawn records) + `TI1/TI2.LIB` → full level PNGs, spawn maps with enemy sprites, `levels.json` (`tools/render_levels.py`). Tileset per episode: TI1 for levels 1–3, TI2 for 4–6.
- [ ] Convert FLI videos → WebM; SFX → OGG; soundtrack → OGG.
- [ ] Optional: package the original with js-dos as an instant browser-playable "museum" version.

### Phase 2: Reverse-engineer gameplay from DP.EXE
- [x] Unit/segment map of DP.EXE: System, Crt, Dos, AniVGA, SMIX + Detect + XMS, CD stack, mouse, joystick, file reader, game unit (session 2).
- [~] Name individual RTL/AniVGA/SMIX routines. First batch done (see re-notes); next: match AniVGA 1.2 / SMIX sources routine by routine (only needed where gameplay depends on them, e.g. `HitDetect`).
- [x] Main loop + game states (sessions 2 and 4): main menu, hangar, game loop with per-tick order, boss start, level end, game over, options, shop.
- [x] Tick timing (session 3): scroll = 1 px/frame; measured ≈ 41 fps at `cycles=64000`. **Decision (user, session 3): fixed 40 Hz tick.** Session 4 correction: the loop has a per-frame `Delay(6/9/12/16 ms)` from the Options "CPU" line (12 ms in the reference), so it is not fully unthrottled.
- [x] Player (session 4): input for keyboard/mouse/joystick, movement (accel 1, decel 1 per 4 ticks, max 2–5), bounds, altitude, damage (shield first), death/respawn/invulnerability, lives, game over, HUD, money.
- [x] Weapons and pods (session 4): mounts per jet, standard weapons, 7 small + 11 large + 4 ball pods, 25 shot types, 24 shot patterns, reload, hit rules, bonus shots.
- [x] Enemies (session 4): record layout, 43 movement subs, guns and salvo logic, 22 enemy-shot patterns, despawn, kills, wrecks, explosions, bonus drops (14 %), delayed spawns; `DS:0x16C2` is a constant (filter is a no-op). Per-type table: `tools/enemy_table.py`.
- [x] Bosses (session 4): all six fights (parts, paths, guns, shields, Golem attacks), end of level, game completion.
- [x] Shop (session 4): catalogue and prices, mount rules, buy/sell, money exchange, Save price. SAVE.DAT and SETTINGS.DAT decoded. Cheat: GEDANKE in the hangar.
- [x] Two-player differences (session 4).
- [x] `docs/gameplay-spec.md` written (session 4): the rules in 40 Hz ticks, with references to re-notes.
- [ ] **User:** record the DOSBox-X checks in `docs/gameplay-spec.md` §13 (priority: draw order, shot speeds, one death, shop list, boss details). Level 4 core invulnerability: confirmed by the user (session 4).
- [x] **User:** original bugs: the remake fixes them (session 4; fixes listed in `docs/gameplay-spec.md` §12).
- [ ] Update the spec from the DOSBox-X captures (§13).
- [x] Extract all gameplay tables to JSON for the engine (session 5): `tools/game_tables.py` (jets, engines, shields, items/prices, standard weapons and pod volleys, shot types, enemy types/guns/shot kinds, explosion anims and kinds, sprite anims and cycles, bonus drops, levels and boss spawns, sound names, shadow brightness). `--check` compares it with the spec values: 0 mismatches. New code findings (Explode, AnimTick, SpawnShot, SetShadowTab, HitDetect, StartBossFight) in re-notes "Engine tables (session 5)".
- [ ] Not yet covered: the text viewer/menus in detail, mission briefing layout, exact HUD fonts, the ending sequence timing.

### Phase 3: Engine + classic mode 🔄
- [x] Project scaffold (session 5): `game/` with Vite + TypeScript + PixiJS + Vitest. Fixed 40 Hz loop in `src/main.ts`, separate from rendering (catch-up capped at 8 ticks). Keyboard input (original keys plus X = fire, C = altitude, because browsers grab Ctrl/Alt combinations). Engine data from `tools/export_engine_data.py` into `game/public/data/` (local only, gitignored like `original_source/`; `npm run data`).
- [x] Deterministic simulation `game/src/sim/` (session 5): ported from the DP.EXE routines, laid out like the original (an AniVGA-style sprite slot table plus the player/enemy/shot records). Own TP `Random`, `Round` and a sin/cos built from IEEE arithmetic only, so it runs identically on every JS engine. Test: two runs with the same seed and input give the same state.
- [x] Classic renderer (session 5): 320×200 indexed framebuffer drawn like AniVGA `Animate` (slots 920→0, playfield clip x 8–311, HUD slots 0–8 unclipped, shadow mode through the `SetShadowTab(70)` table), EPIS1 palette, integer nearest-neighbour scaling with square pixels.
- [x] First playable slice (session 5): level 1 scrolling with tiles; spawning from the level records; player movement, altitude and draw-order swap, shadows; Firestorm and the other standard weapons and simple pods; enemy subs used in level 1 (0–6, 9–0x11) with their guns and enemy shots (patterns 1–5, 8–16, 18, 20); hit test, shot/enemy-shot/ramming collisions, damage, death, respawn and invulnerability; explosions, sprite animations and cycles; HUD bars, money and lives. Level 1 runs to the boss trigger (scroll stops at y −5561). Side by side with the DOSBox-X capture `dp_002.avi` at scrollY −1349: tiles and spawned objects line up exactly.
- [ ] **User:** play the slice (`cd game && npm run data && npm run dev`) next to DOSBox-X and report what feels different (speed, steering, enemy paths, shot speeds).
- [ ] Decide: square pixels (now) or 4:3 aspect correction (320×200 shown as 320×240, as on a CRT).
- [ ] Audio: SFX → OGG/WAV and Web Audio playback (the sim already emits sound events); CD music later.
- [ ] Remaining level-1 content: bonus drops, pickups and inventory; the level 1 boss (escort pair, sub 0x14) and level end; game over and back to the menu.
- [ ] Remaining weapons: Autogun targeting, Flamer, Windstorm, ball pods, bonus shots (shot patterns 2, 7, 9–13, 22, 23).
- [ ] Enemy subs 7, 8, 0x12–0x2A and enemy-shot patterns 6, 7, 17, 19, 21, 22 (episode 2 and bosses), then levels 2–6.
- [ ] Menus, hangar, shop, saves, options, mission briefings, two players (mouse/joystick/gamepad input).

### Phase 4: Remastered mode
- [ ] Interpolated high-refresh renderer, upscaled assets, effects, streamed music, mode switch in the menu.

## Decisions (user)
1. Classic mode doesn't need to be frame-exact. It must play and feel identical.
2. Language: classic version German only. An English translation can come later in the remastered version (settings switch). The remastered version waits until the classic version is finished.
3. Local two-player is a must.
4. Tech stack confirmed: TypeScript + PixiJS, browser-first.
6. Simulation tick: fixed 40 Hz (measured ≈ 41 fps in the DOSBox-X reference; the original is CPU-bound).
5. Soundtrack split: resolved in session 2 (2 menu, 3 story, 4 intro, 5/6/7 levels, 8 boss, 9 ending).
7. Remaining Phase 1 conversions (FLI → WebM, SFX and music → OGG) wait until the engine scaffold needs them (user, session 4).
8. Original bugs are fixed in the remake, including any found later (user, session 4). List: `docs/gameplay-spec.md` §12.
9. No CPU option in the remake; modern machines run the fixed 40 Hz tick (user, session 4).
10. The low-memory "reaper" (`MemoryGuard` @0x1B600) is not replicated (user, session 4).
11. Engine data generated from `original_source/` (sprites, tiles, levels, tables) stays local (`game/public/data/`, gitignored), like the original files (session 5; not yet confirmed by the user).
