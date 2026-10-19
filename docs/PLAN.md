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
- [ ] **User:** test `dplanet-cd.conf` in DOSBox-X; listen to the tracks and identify the missing boundary (≥ 8 audio tracks needed).
- [ ] Find out how DP.EXE calls `startaud` (fixed track 9, or per level?).
- [ ] Fix `TRACK_STARTS`, rebuild the image, verify music in-game.
- [ ] Investigate the garbled SFX in DOSBox-X (try sbtype sb16/sbpro2, cycles auto/max, goldplay; check the SMIX sample rate).
- [ ] Decode AniVGA `.LIB`/`.COD` sprites and `.FNT` fonts → PNG atlases.
- [ ] Decode `.LEV` level maps + `TI1/TI2.LIB` tiles → render full level images.
- [ ] Convert FLI videos → WebM; SFX → OGG; soundtrack → OGG.
- [ ] Optional: package the original with js-dos as an instant browser-playable "museum" version.

### Phase 2: Reverse-engineer gameplay from DP.EXE
- [ ] Identify the TP7 RTL, AniVGA and SMIX routines in DP.EXE and name them (static, REA/Ghidra).
- [ ] Map the main loop, game states (menu, briefing, shop, level, boss, game over) and tick timing.
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
5. Does the soundtrack split sound right? Which tracks are intro, in-game and boss music?
