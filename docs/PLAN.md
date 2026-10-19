# Plan & progress

## Goals (from the user)
1. Easily shareable and cross-platform, probably as a browser version.
2. A **remastered** mode (higher-resolution graphics, smoother motion) and a faithful **classic** mode, switchable from the start menu.
3. Modern game libraries are fine.
4. Bonus: the original CD soundtrack playing.

## Proposed architecture (not yet confirmed by the user)
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
- [ ] Investigate the garbled SFX in DOSBox-X (try sbtype sb16/sbpro2, cycles auto/max, goldplay; check the SMIX sample rate).
- [ ] Decode AniVGA `.LIB`/`.COD` sprites and `.FNT` fonts → PNG atlases.
- [ ] Decode `.LEV` level maps + `TI1/TI2.LIB` tiles → render full level images.
- [ ] Convert FLI videos → WebM; SFX → OGG; soundtrack → OGG.
- [ ] Optional: package the original with js-dos as an instant browser-playable "museum" version.

### Phase 2: Reverse-engineer gameplay from DP.EXE
- [x] Unit/segment map of DP.EXE: System, Crt, Dos, AniVGA, SMIX + Detect + XMS, CD stack, mouse, joystick, file reader, game unit (session 2).
- [~] Name individual RTL/AniVGA/SMIX routines. First batch done (see re-notes); next: match AniVGA 1.2 / SMIX sources routine by routine.
- [~] Main loop + game states: main body, main menu, game menu, game loop, boss start, end-of-game mapped (session 2). Next: shop (`FUN_1d9e_84bc`), options (`FUN_1000_c4cd`), level start (`0x1B582`), game over / level end (`0x1B6D1`, `0x1A951`).
- [ ] Measure tick timing in DOSBox-X (PIT ch0 isn't reprogrammed; count `DS:0x552E` per second).
- [ ] Player: movement, weapons/pods, shields, energy, the tank-vs-ship mechanics (see prototype).
- [ ] Enemies: types, energy, movement patterns, wave/spawn scripting, bosses (Golem…).
- [ ] Shop: items, prices (`INFO.PAS` texts), refunds ("Rückzahlung", "Investiert").
- [ ] Two-player mode, controls (keyboard/joystick), settings, save format, cheat.
- [ ] Cross-check with the DOSBox-X debugger (memory diffing) and recorded gameplay.
- Document everything in `docs/re-notes.md` (and later `docs/gameplay-spec.md`).

### Phase 3: Engine + classic mode
- [ ] Project scaffold (Vite + TS + PixiJS), fixed-tick loop, input, audio.
- [ ] Classic renderer; reimplement level by level, comparing side by side with DOSBox-X.

### Phase 4: Remastered mode
- [ ] Interpolated high-refresh renderer, upscaled assets, effects, streamed music, mode switch in the menu.

## Open questions for the user
1. How strict is classic mode: frame-exact, or "plays and feels identical"? (Suggested: the latter.)
2. Language: German only, or add English? Some humour may need care in translation.
3. Is local two-player a must for the remake?
4. Confirm the tech stack (TS + PixiJS) and the browser-first approach.
5. ~~Soundtrack split~~: resolved in session 2. Track roles come straight from DP.EXE: 2 menu, 3 story, 4 intro, 5/6/7 levels, 8 boss, 9 ending.
