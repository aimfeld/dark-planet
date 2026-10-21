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
- **Distribution (user, session 11):** the browser version is the product: desktop browsers, and phones and tablets with touch controls (installable from the browser as a PWA). Steam and the app stores are **optional**, probably not worth the hassle. If ever wanted: Electron rather than Tauri for Steam (the same Chromium on Windows, macOS, Linux and the Steam Deck; Tauri would use WebKitGTK there), Capacitor for Google Play / the App Store.
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
- [x] **User:** play through `dplanet-cd.conf` and check the music: menu = track 2, levels 1–3 = tracks 5–7, boss = track 8, and tracks loop. Optionally confirm by ear that track 8 starts at 21:57 (1317 s) and not at 22:08. Confirmed by the user (session 17): the level and boss tracks are right.
- [–] ~~Fix DOSBox-X audio~~: **decision (user, session 2): not needed.** The target is the TypeScript version. In DOSBox-X the CD music plays fine with `dplanet-cd.conf` (confirmed by the user; an earlier choppiness came from a runaway analysis script loading the host CPU). Only the SFX are garbled (a known DOSBox issue; the user decoded the SFX correctly in Python before). Game speed is fine with `dplanet.conf`. DOSBox-X stays a reference for gameplay and visuals, not for audio.
- [x] Update DOSBox-X (2026-10-21): 2026.10.01 from Flathub (the user chose it over building 2026.06.02, which has no Linux binary), with the `~/.local/bin/dosbox-x` wrapper. The garbled SFX turned out to be a DOSBox-X XMS bug (a 0 KB block overlaps the next allocation). The config now runs `tools/dosbox/XMSHOLE.COM` before the game; headless capture matches GRLASER (correlation 0.99). See re-notes "SFX in DOSBox-X".
- [x] **Decision (user, 2026-10-21): one config.** `dplanet-cd.conf` became `original_source/dplanet.conf`; the old no-music `dplanet.conf` (`dpmin.bat`) is gone. Without the CD image the game simply runs without music. Paths are relative to `original_source/` and it mounts `../tools/dosbox`, so a Steam Deck copy needs `tools/dosbox/` beside `original_source/`.
- [x] Cleanup (user, 2026-10-21): the duplicate disc images `DPImage.bin/.cue/.mdf/.mds` (verified to hold nothing beyond `DPImage.iso`, re-notes "Soundtrack"), the unreferenced captures `dp_000.avi`/`dp_001.avi` and the empty `save/` were deleted from `original_source/` (944 MB left). Kept: `DPImage.iso` (input of the tools), `Image/fixed/` (mounted by `dplanet.conf`), `capture/dp_002.avi` (evidence in re-notes), `extracted/`.
- [x] **Decision (user, 2026-10-21): the original is committed**, so a clone plays it in DOSBox-X (no js-dos): `original_source/Game/`, `CD/`, `Screenshots/`, `dplanet.conf` and the new `cdaudio/` (`dplanet.cue` = a 350 KB placeholder data track `DATA.ISO` made with genisoimage + the committed `game/public/music/track02–09.mp3` via `../../`). `Game/` and `CD/` share their blobs. Not committed: `Image/` (DPImage.iso, `fixed/`), `capture/`, `extracted/`. The config mounts `save/` as a DOSBox-X overlay over C: and runs DPMAX.BAT's steps without `attrib -R` (which made the overlay copy all 71 MB). `.gitattributes`: `original_source/** -text`. Tested headless with 2026.10.01: 8 MP3 tracks load, track 4 then 2 (main menu) play, `save/` stays empty, `Game/` unchanged.
- [x] The disc image as a GitHub Release download (user, 2026-10-21): release `disc-image` with `DPImage.iso.xz` (xz -9e: 77 MB, the audio is dual-mono; checked to unpack to the same SHA-256 `f0e2cfeb…806c20b`). Local `Image/fixed/` deleted (rebuild with `tools/build_cd_image.py`).
- [ ] **User:** play `dplanet.conf` and confirm by ear that the SFX sound right in the menu and in a level.
- [x] SFX format verified in DP.EXE (session 3): signed 8-bit, 11025 Hz. `extract_assets.py` assumed unsigned 22050 Hz and is fixed.
- [x] **User:** corrected SFX WAVs sound right (session 3).
- [x] Decode AniVGA `.LIB` sprites → PNG sheets + `sprites.json` (`tools/extract_sprites.py`, numbers as DP.EXE loads them).
- [x] Decode `.FNT` fonts → PNG + widths (`tools/extract_fonts.py`).
- [x] **User:** sprite sheets, fonts and level renders match the game (session 3).
- [x] Decode `.LEV` (tile grid + 600 spawn records) + `TI1/TI2.LIB` → full level PNGs, spawn maps with enemy sprites, `levels.json` (`tools/render_levels.py`). Tileset per episode: TI1 for levels 1–3, TI2 for 4–6.
- [x] Soundtrack → MP3 (session 7): `tools/export_music.py` → `game/public/music/track02–09.mp3`, mono (both channels are identical), LAME VBR -V5, 12 MB in total. MP3 rather than OGG/Opus because Safari still decodes Ogg/WebM Opus unreliably (especially in Web Audio). Not yet played by the game.
- [x] Generated assets under version control (session 7, decision 11 corrected): engine binaries as reproducible `*.bin.gz` (unpacked with `DecompressionStream`; the loader also accepts data a server already unpacked via `Content-Encoding: gzip`, as Vite's dev server does), JSON plain. SFX stay lossless 8-bit PCM inside `sounds.bin.gz` (700 KB) instead of OGG.
- [x] **User:** listen to a few `game/public/music/*.mp3` tracks; if -V5 mono sounds too lossy, raise `LAME_VBR_QUALITY` (-V4 adds about 15 %). Fine, no worse than the original soundtrack (user, session 17).
- [x] FLI videos → WebM (session 10): `tools/export_videos.py` → `game/public/video/intro.webm` (12.6 MB) and `ending.webm` (1.1 MB), AAPLAY's playlists with loops and white flashes baked in (RE in re-notes "Intro and ending videos").
- [x] ~~Optional: package the original with js-dos as an instant browser-playable "museum" version.~~ Not needed (user, session 17).

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
- [x] Menus, text viewer, mission briefings, ending text, options, shop screen and load/save flow (session 8, static RE by three parallel forks): re-notes "Main menu, hangar, options", "Text viewer…", "Shop screen and load/save". Fonts: FIRE (HUD), SUPER (text viewer), _BROADWA (hangar, options), DEFAULT (shop). Palettes: HMBILD/UMBILD own .PAL, OMBILD and RASTER use EPIS1.
- [x] DOSBox-X checks for the menus: real frame time of the text viewer (scroll speed of story/about/ending): the remake's scroll speed is fine (user, session 17). Not checked: whether 39+ character lines are clipped at x 319.

### Phase 3: Engine + classic mode ✅ (session 17, 2026-10-20)
Done (user, session 17): play-tested through, including two players; the open items left below are optional.
- [x] Project scaffold (session 5): `game/` with Vite + TypeScript + PixiJS + Vitest. Fixed 40 Hz loop in `src/main.ts`, separate from rendering (catch-up capped at 8 ticks). Keyboard input (original keys plus X = fire, C = altitude, because browsers grab Ctrl/Alt combinations). Engine data from `tools/export_engine_data.py` into `game/public/data/` (local only, gitignored like `original_source/`; `npm run data`).
- [x] Deterministic simulation `game/src/sim/` (session 5): ported from the DP.EXE routines, laid out like the original (an AniVGA-style sprite slot table plus the player/enemy/shot records). Own TP `Random`, `Round` and a sin/cos built from IEEE arithmetic only, so it runs identically on every JS engine. Test: two runs with the same seed and input give the same state.
- [x] Classic renderer (session 5): 320×200 indexed framebuffer drawn like AniVGA `Animate` (slots 920→0, playfield clip x 8–311, HUD slots 0–8 unclipped, shadow mode through the `SetShadowTab(70)` table), EPIS1 palette, integer nearest-neighbour scaling with square pixels.
- [x] First playable slice (session 5): level 1 scrolling with tiles; spawning from the level records; player movement, altitude and draw-order swap, shadows; Firestorm and the other standard weapons and simple pods; enemy subs used in level 1 (0–6, 9–0x11) with their guns and enemy shots (patterns 1–5, 8–16, 18, 20); hit test, shot/enemy-shot/ramming collisions, damage, death, respawn and invulnerability; explosions, sprite animations and cycles; HUD bars, money and lives. Level 1 runs to the boss trigger (scroll stops at y −5561). Side by side with the DOSBox-X capture `dp_002.avi` at scrollY −1349: tiles and spawned objects line up exactly.
- [x] **User:** play the slice (`cd game && npm run data && npm run dev`) next to DOSBox-X and report what feels different (speed, steering, enemy paths, shot speeds) (user, session 17: play-tested).
- [x] Decide: square pixels (now) or 4:3 aspect correction (320×200 shown as 320×240, as on a CRT). Square pixels stay (decision 20).
- [x] Audio (session 6): the SFX are exported as signed 8-bit PCM (`sounds.bin` + `sounds.json`, index = PlaySound number; raw PCM instead of OGG, decision 7 left the format open) and played with Web Audio at 11025 Hz (`src/audio/sfx.ts`): looped sounds and stops, SMIX's 32 voices and the original's voice-count conditions (shots < 5, enemy fire < 4, explosions < 7, "only if not playing"). CD music later.
- [x] Fullscreen key F with the Keyboard Lock API (session 6, `src/input/fullscreen.ts`; all keys locked, so Chrome asks to hold Esc to leave fullscreen). X/C stay as alternates.
- [x] macOS (user, session 12, Brave): Ctrl+arrows switch Spaces / open Mission Control even in fullscreen with Keyboard Lock; a page can't stop that. The README explains how to turn the shortcuts off in System Settings.
- [x] Key legend below the picture (user, session 12; `src/input/keyLegend.ts`): one line per player (P2 only in multiplayer) with that player's control type: arrows (the right-hand keys while a WASD player plays), mouse buttons, gamepad buttons and keypad −/+, WASD; then P / Esc / F, in the manual's words (ballern, hoch/tief, Bonus selektieren/abfeuern). During the intro and ending videos it says how to skip them (any key or a click); it keeps two lines' height so the picture doesn't change size when a video ends. It lists X/C/V for the arrow player on every platform, not the original Ctrl/Alt/Space (decision 15). The integer-scaled picture keeps room for it (`ClassicView.setBelow`), so on a 1440x900 Mac in fullscreen the scale drops from 9 to 8 device pixels. Hidden with touch controls. Checked in Chrome (main menu, arrows + WASD).
- [x] P2 defaults to WASD (user, session 12; the original's default is mouse), so two players can share a keyboard without visiting the options. Saved settings keep their choice; touch devices still default to P1 touch, P2 keyboard.
- [x] ~~Mac, two players on one keyboard (session 12): right Option fires, the key left of right Shift switches altitude.~~ Replaced in session 13 by , . - on every platform (decision 15). Right Cmd stays avoided: macOS sends no keyup for other keys while Cmd is held, so arrows would stick.
- [x] Hangar freeze (user, session 14): sometimes the doors stopped animating and clicks did nothing while the pointer still moved. Likely cause (inferred, not reproduced): a key whose keyup never arrived. The hangar then stays in its wait for all keys to be released (the cheat input), and only Esc gets out. The desktop can take a modifier's keyup without the window losing focus (Ctrl+Alt+arrows on Cinnamon), and macOS drops keyups while Cmd is held. `Keyboard` now forgets modifiers that a later key or pointer event reports as up (AltGr counts for AltRight and Windows' extra left Ctrl). It also clears all keys when Cmd is released or when the page is hidden. Unit-tested in `test/input.test.ts`.
- [x] Main menu hover (user, session 14; decision 16, the original's menu ignores the mouse): moving the pointer onto an item selects it (glow + GRLASER, like the arrow keys), a click opens it. A resting pointer doesn't take the selection back from the keys. `test/menus.test.ts`. Usability deviations so far collected in `docs/gameplay-spec.md` §14.
- [x] Dev level keys (user, session 14; a testing aid, not part of the classic mode): on the dev server only (`import.meta.env.DEV`, dropped from the production build), 1–6 in the hangar start that level without the briefing, Shift+1–6 start it at the boss (`startLevel(w, level, atBoss)` starts scrolled to the level's boss record, so the first tick runs the normal StartBossFight). Listed in README "Testing shortcuts" next to GEDANKE. `test/menus.test.ts`.
- [x] **User:** check whether the hangar still freezes (user, session 17: play-tested, no freeze reported).
- [x] **User:** in Chrome on Linux Mint/Cinnamon, press F and check whether Ctrl+Alt+arrows now reach the game instead of switching workspaces (theory: an active X11 keyboard grab beats the window manager's passive key grabs). Confirmed by the user (session 17): in fullscreen they reach the game.
- [x] Remaining level-1 content (session 6): bonus drops, wobbling objects, pickups (only while flying high), the 3-slot inventory (Space selects, Ctrl+Space uses), all 10 bonus effects with shot patterns 10–13 and 22, the atom bomb's grey flash, ×5 damage; StartBossFight (clearing, fades, parts in fixed slots, frozen ticks), the level 1 boss (sub 0x14, scripted 3-way fire, hit sounds), the core's death and the level-end autopilot; game over ("Loser!", 120-tick countdown); a placeholder flow main menu → level → fade → hangar → next level (`src/game.ts`).
- [x] **User:** play level 1 to the end (bonuses, boss, level end, game over) and report differences; listen to the sounds (user, session 17: play-tested).
- [x] Remaining weapons (session 7): Autogun targeting (Nearest(1)), Flamer (flame anim, glued to its pod), G-Destructor scatter, ball pods (orbit, firing, enemy-shot removal, contact damage); all 24 shot patterns are ported. Found on the way: anim 5 belongs to the Flamer, not the Missiles; the ball orbit is k°/tick, not 2k°. New original bugs §12 #15 (aimed-shot 16-bit overflow) and #16 (ball-pod explosion altitude); fixes #2 (Distroyer reload 10) and #3 (P2's ball pod damages) are in. `test/weapons.test.ts`.
- [x] **User:** decide whether ball pods (and ramming) may damage the level 4/5 boss cores while their parts live. The original allows it (only shots are blocked); the remake keeps that (decision 21).
- [x] Episode 2 and the bosses (session 7): all 43 enemy subs, all 22 enemy-shot patterns, Direction8 and Nearest(2), the per-type hooks (snake facing and head fire, turret facing, parts riding on the cores), BossScript for levels 2–6 (`src/sim/bosses.ts`: level 2 core dropping to the ground, snake shortening from the back, tank, fortress, Golem intro/curse/teleport/rocks/bounce/lasers/death), Quake's sound 14. Levels 2–6 play through to their bosses (`test/bosses.test.ts`). Fixes per decision 8: §12 #7–9 (session 4 list) and new #17 (snake ghost sprite), #18 (dead Golem paid again), #19 (snake refill without the 2P bonus). Spec correction: the curse also turns the standard weapon into item 1, the Firestorm's gun.
- [x] **User:** play levels 2–6 (episode 2 enemies, all five bosses) and report differences (user, session 17: play-tested).
- [x] **User:** the Golem curse turning every jet's standard weapon into the Firestorm's gun is intentional (decision 12).
- [x] Menus (session 8): main menu, text viewer (story, manual, about, briefings, ending text), hangar with doors, labels, Multiplayer join and the GEDANKE cheat, options (stored in browser storage), CD music (`src/audio/music.ts`, tracks loop like CDRepeat; level, boss and menu tracks). The menus are generator coroutines (`src/screens/`) that yield the milliseconds each step takes, so they keep the original's Delay(15) loop passes and 70 Hz fades while the levels keep the 40 Hz tick. Exporter: `pictures.bin.gz` (HMBILD/UMBILD/OMBILD/RASTER), the menu palettes, all four fonts, `texts.json`. `test/menus.test.ts` (screens dumped to `test-output/menu-*.bmp`).
- [x] **User:** try the menus (`cd game && npm run dev`): main menu glow and keys, story/manual/about, hangar doors and labels, briefing slide-in, options, CD music switching (menu → level → boss → menu) (user, session 17: play-tested).
- [x] Shop and save/load (session 9): `src/screens/shop.ts` ports 1d9e:84BC with all its helpers (offers, buy with the large-pod placement on the pointer, sell, position change, player switch, money exchange, INFO.PAS texts, shadowed unaffordable offers), `src/save.ts` reads/writes the original 129-byte SAVE.DAT with its checksum (browser storage, base64; the original sample loads). Main menu "Spiel laden" works; a bad checksum shows the "Schlitzohr" message. New RE in re-notes "Shop rules (session 9)" (corrections: 272c:00DC is "button held", empty/unaffordable boxes ignore clicks, info lines are sprites 826+k, the item header has no offset). `test/shop.test.ts` drives it through the hangar; checked live in Chrome (cheat, buy + place a pod, Save, reload, load).
- [x] **User:** try the shop (hangar → Shop; GEDANKE for money): buying and placing large pods, selling, Position wechseln, jets, boni, Save + "Spiel laden", and with two players the PLAYER switch and GELD AUSTAUSCH (user, session 17: play-tested).
- [x] Two players and control types (session 10): the mouse (0x1A34B) and joystick (0x1A58F) handlers are ported (`playerInput` in `src/sim/player.ts`); each player reads the device chosen in the options (`src/input/players.ts`). Gamepad API as the joystick (`src/input/gamepad.ts`), pointer lock for a mouse player during levels with the real pointer as fallback. `test/input.test.ts`; checked in Chrome with P1 mouse + P2 keyboard, then P2 on a mocked gamepad (pointer lock itself can't be granted in the automated tab).
- [x] **User:** play with the mouse (Options → Steuerung Player1: Maus): does the pointer get captured on entering a level (or on the first click), does the steering feel right? And with a gamepad as Joystick if you have one (user, session 17: play-tested).
- [x] Two players on one keyboard (decision 13, session 10): control type 4 "WASD" in the options (W/A/S/D move, X fires, C altitude, V selects a bonus, X + V uses it; until session 13 left Shift, Q and E). While a WASD player is in the game, the arrow player uses only the keys right of the space bar (since session 13, decision 15: Comma fires, Period switches altitude, the key left of right Shift (code `Slash`, - on German/Swiss keyboards) selects, Comma + Minus uses; before that right Ctrl/Alt/Shift), so neither player can trigger the other. Checked in Chrome with P1 arrows + P2 WASD.
- [x] **User:** try two players on one keyboard (Optionen → Steuerung Player2: WASD) (user, session 17: play-tested).
- [x] Intro and ending videos (session 10): the game starts behind a "Taste oder Klick zum Starten" prompt (browsers need a gesture for sound), then plays the intro with CD track 4 (DPMAX.BAT), then the main menu; after the ending text the ending video plays with track 9, then the main menu. A key or click skips a video. `src/video.ts`, `src/screens/video.ts`, `test/video.test.ts`.
- [x] **User:** watch the intro and the ending and check the white flashes, the logo hold and the music (user, session 17: play-tested).
- [x] **User:** say whether the intro should play on every start. Yes (decision 19).

- [x] Touch controls for phones and tablets (session 11, decision 14): control type 5 "Touch" (`src/input/touch.ts`), the default on devices whose primary pointer is a finger. An HTML overlay beside the picture: a floating stick on the left (direction flags like the joystick, 8 directions), Feuer / Höhe / Bonus wählen / Bonus feuern on the right (a finger can slide between them; a double tap on Feuer locks autofire, the next tap releases it). Layout: beside the picture in landscape, below it in portrait, clear of the notch (`viewport-fit=cover`, safe-area insets); the picture fills the free space (non-integer scale). Menus take taps: main menu items, options lines, taps end the story/about/briefing/ending, the manual and the Multiplayer question offer their keys as buttons (`Ctx.touchKeys`), a long press is the right button (cancels a pod in the shop). Levels have a pause button; Esc (✕) while paused ends the level. Leaving the app pauses the level and silences the music. Fullscreen button with landscape lock where supported (not on iPhone: "Zum Home-Bildschirm" with the new `manifest.webmanifest` instead). Sound starts on `pointerup`/`touchend` (a touch's `pointerdown` doesn't count as a gesture). `test/touch.test.ts`; checked in headless Chrome emulating a phone (landscape and portrait) and a tablet: start, intro, menu, hangar, briefing, steering, firing, autofire, pause, ✕.
- [~] **User:** play on a real phone and tablet (`npm run dev -- --host`, open the LAN address, or serve it over Tailscale): works on the user's Android phone (session 11). Still open: a tablet, an iPhone, and feedback on the steering feel, button sizes and places, autofire double tap, the shop with taps and long press.
- [x] Check the intro/ending WebM (VP9) on iPhone/iPad Safari; add an MP4 fallback if it doesn't play. The intro plays in Safari on the user's iPhone (session 17), so no MP4 fallback.
- [x] PWA (session 12): icons cut from the title picture (HMBILD, both jets and the fire; `tools/export_icons.py` → `public/icons/`, 192/512 px "any" and "maskable", apple-touch-icon, favicon), manifest with `id`, icons, description. Service worker `game/sw.js`: the build (`offlinePlugin` in `vite.config.ts`) prepends the list of built files and content hashes and writes `dist/sw.js`. Install caches the core (app shell, Pixi chunks, `data/`, about 2 MB) in `dp-core-<hash>`, and the music and videos (26 MB) best effort in `dp-media-<hash>`, so a code update doesn't download them again; a media file missing there is cached after its first use. Cache first; navigations get `index.html`; `<audio>`/`<video>` range requests get 206 slices of the cached file (Safari needs them). `skipWaiting` + `clients.claim`: an update takes over in the background (a running game has loaded its code and data at boot). Registered only in production builds, after the data has loaded; also asks for persistent storage (saves). Checked in headless Chrome 155 against `vite preview`: no manifest or installability errors, both caches filled, an offline reload reaches the start prompt, music seeks and the intro video loads offline, ranges (incl. suffix ranges) answer 206.
- [~] **User:** install the app on the phone (needs HTTPS: the build behind `tailscale serve`, or a static host) and play once offline; check the icon on the home screen and that iOS opens it without the Safari bars. iPhone (2026-10-20): installed from GitHub Pages via Safari's share sheet → "Zum Home-Bildschirm", opens without the Safari bars. Still open: offline start on the iPhone.
- [x] Hosting on GitHub Pages (decision 17): `.github/workflows/deploy.yml` builds `game/` (`npm ci`, `npm run build`) on every push to `production` and deploys `game/dist` to https://aimfeld.github.io/dark-planet/. The `github-pages` environment only accepts deploys from `production`. `bin/deploy.sh` publishes `main`: clean, pushed, tests and build pass, then fast-forwards `production` to it and follows the run with `gh`. The tests run only in the script, not in CI (some need `original_source/`). A clean checkout builds (checked locally).
- [x] Installed app (user, session 14): it was hard to leave. The ⛶ button put an element fullscreen on top of the app's own fullscreen display, so Chrome showed its "swipe from the top / Back" hint and Back only left that layer. Now the button is hidden in the installed app (`display-mode: fullscreen`), and the main menu's Exit (and Esc) closes the installed app with `window.close()` (allowed while the window has a single history entry). Where that is refused (iOS), the old behaviour stays: black until a key, then the menu. `src/main.ts`; gameplay-spec §14.
- [x] **User:** Exit closes the installed app on the user's Android phone (session 14).
- [x] User feedback (session 15): (1) SFX drowned the music: SFX gain 0.5, then 0.35, then 0.25, then 0.18 (−15 dB) after listening (gameplay-spec §14). (2) The fifth large-pod frame (Alien-Pro 2's outer right mount) was missing in the shop: a remake bug, not the original's; the frames belong in slots 26..30, the port used 27..31 and the header icon (slot 31) replaced the fifth (re-notes "Jet display"; `test/shop.test.ts`). (3) The level 4 turrets' red shots started at the left edge: a remake bug, the shot sprite took its x from the record field that holds the turret's facing (re-notes EnemyFire; `test/bosses.test.ts`). (4) The cheat riddle is in About, not Story; the original cuts it off at line 199, the remake shows it to line 207 (spec §12 #20).
- [x] Installed app updates (user, session 15: the PWA kept the old, loud SFX). Browsers look for a new `sw.js` only when a page is opened, and an app on a phone is mostly resumed; the new version then took over in the background and only showed at the start after that. Now (`registerOffline` in `src/main.ts`): a start that runs from the cache asks the server first (up to 4 s) and, if there is a new version, shows "Lade Update…", waits for it (up to 20 s) and reloads; the app also asks when it comes back to the screen and every hour, and a new version reloads the page at the start prompt, during the intro or in the main menu (never in a level, the shop or the ending). `sw.js` is fetched past the HTTP cache (`updateViaCache: 'none'`). Checked in headless Chrome against two local builds: resumed (visibility) → reload to the new version; restart → "Lade Update…", one reload, new version; no update → one load; offline → starts from the cache.
- [x] Start prompt only where needed (user, session 16): its only job is the user gesture that browsers may require for sound (a key would otherwise both start the intro's CD track and skip the intro). Now the intro starts at once, as with DPMAX.BAT, where the browser allows sound (`Music.refused()` in `src/audio/music.ts`: the play() of track 4 failed with `NotAllowedError`; still loading after 1 s counts as allowed), or with CD sound off; otherwise "Taste oder Klick zum Starten" as before. Checked in Chrome: a fresh tab shows the prompt, a click starts the intro with track 4; a reload after that interaction goes straight into the intro with music.
- [x] **User:** check where the prompt still shows: installed app on Android (Chrome allows sound for home-screen apps, so expected: no prompt), iOS (expected: prompt), desktop Chrome on a first visit (prompt) and later visits (depends on Chrome's media engagement). User (session 17): it always shows on their devices, and that's fine.
- [x] Screen stays on during the videos (user, session 16): on a phone the screen dimmed or turned off during the intro, since nobody touches it and the hidden, muted `<video>` doesn't keep the screen awake. `Video` now holds a Screen Wake Lock while a video plays (`src/video.ts`), requests it again when the page becomes visible mid-video (the browser drops it when the page is hidden), and releases it on stop (skip or end). Unsupported or refused: the screen may dim as before. Checked in desktop Chrome: lock held during the intro, released after skipping.
- [x] **User:** the screen stays on during the intro on the user's phone (session 16).
- [x] Start screen (user, session 20), replacing the start prompt: always shown before the intro, over RASTER.PIC
  with the EPIS1 palette. Title "DARK PLANET" (FIRE), the intro sentence ("Dark Planet ist ein Shoot 'em up für DOS
  aus dem Jahr 1998, inspiriert von Raptor und Xenon 2.", user, session 20: the genre's name instead of "Retro DOS Game", SUPER), two buttons in the options' BROADWA white with the
  options' star cursor: "Classic 1998" in the 320 x 200 font (nearest-scaled in the remastered view,
  `TextSprite.classic`) and "Remastered 2026" in the remastered font, and a grey hint that the version can be
  switched any time (R, or HD on touch, or Options). main.ts draws the screen remastered whatever the setting and
  shows the system pointer there. Arrows switch, Enter/Space or a click/tap chooses; the pointer selects the button
  it moves onto. The choice sets and saves `settings.remastered`, then the intro plays. Choosing is the user
  gesture, so `Music.refused()` and the `#start` prompt are gone. `src/screens/start.ts`, `test/video.test.ts`.
  Checked in Chrome: both fonts as intended, a click on Classic starts the intro with track 4 and classic graphics.
  Then (user, session 20): the other texts (title, intro, hint) and the star cursor take the selected version's
  style; only the other button keeps its own (`Screen.classic` per slot for sprites). Checked in Chrome.
  The background too (user, session 20; `Screen.classicPicture`): the 320 x 200 RASTER.PIC nearest-scaled, or the
  hq4x one. Checked in Chrome (renderer state); on RASTER's fine noise the two look nearly the same.
  The HD button (or R) switching the graphics there moves the cursor to that version (user, session 20).
- [x] Main menu Exit / Esc (user, session 20): instead of black until a key, the remake starts over at the start
  screen (then the intro, then the main menu). The installed app still closes first where it can (`window.close()`,
  `ctx.quit` until the start screen shows). `boot` in `src/game.ts`, `src/screens/mainMenu.ts`, `test/menus.test.ts`.
- [x] Touch layout (user, session 20): the HD button stands centred over the fire/bonus column (where it fits, always
  when it is alone, e.g. without the ⛶ button); the level's ❚❚ and ✕ key buttons are hidden without touch (the mouse
  player's pointer is captured; P and Esc on the keyboard). `src/input/touch.ts`, `src/main.ts`.
- [ ] **User:** look at the start screen (layout, texts, the "DARK PLANET" title, which wasn't asked for).
- [x] **User:** listen to the new SFX/music balance; say if the SFX should be quieter still. Fine at 0.18 (user, session 17).
- [x] **User:** decide whether the ending text should also show MISSIONS.PAS 123–124 ("übrigens: Hast du den Cheat schon entdeckt?"), which the original leaves out. No, left as in the original (decision 22).
- [ ] Later: also publish on itch.io (HTML5 upload of a `dist/` zip); offline/install is unreliable in its iframe, so GitHub Pages stays the main home.
- [x] Polish pass, part 1 (session 11, decision 18): compared level 1 frame by frame with the DOSBox-X capture
  `dp_002.avi` (each frame located on the level map by background matching) and played levels 1–6 through in Chrome
  with a scripted bot. Fixes: the level tiles were drawn 8 px too low (AniVGA's PutTile snaps to its 16 px grid; now
  houses, cars, people and the boss stop match the capture exactly), and the level 2 ground core no longer drifts off
  the top of the screen (original bug, spec §12 #21). Everything else checked matched: spawn timing and positions,
  enemy paths, HUD, game over, the two-player HUD with P1 out, all boss fights, the level transitions, music and the ending.
- [ ] **User:** DOSBox-X recordings for the open checks (list in the session-11 notes below).

### Phase 4: Remastered mode 🔄 (merged into `main` in session 18, 2026-10-20)
- [x] Interpolated high-refresh renderer, upscaled assets, effects, mode switch in the menu (details below). The
  music stays the original CD tracks (decision 24).
- [x] Remastered graphics (branch `remaster-experiment`, session 17): `tools/remaster_upscale.py` upscales 4x into
  `game/public/remaster/hq4x/` (16 MB AVIF since session 18, committed; 28 MB of WebP before): all six levels,
  each as one picture (real tile neighbours, no seams) in 25 chunks of 1280 x 1024; every sprite, trimmed onto 4096 x 4096 atlas pages per
  group (common, shop, episode 1, episode 2 in EPIS1; REST.LIB again in the main menu's HMBILD and the hangar's
  UMBILD palette); the four PIC backgrounds in their screens' palettes; the four fonts as glyph atlases (mono fonts
  white, tinted with the ink colour). Sprites and glyphs: colour and outline upscaled separately (transparent
  pixels take the nearest opaque colour first, the upscaled outline becomes a narrow soft alpha edge).
  `src/render/hiResView.ts` draws levels and menu screens with them in PixiJS: background chunks streamed by
  scroll position, slots like `Framebuffer.render`/`renderScreen`, shadows as a black tint at the shadow table's
  mean darkening, fades and the flash as an overlay; anything without an upscaled version nearest-scaled. Videos
  stay as they are.
  Methods compared: nearest, hq4x and xbr4 (ffmpeg filters), Real-ESRGAN x4plus (ncnn-vulkan in `~/opt/realesrgan`;
  smears the dirt textures and shifts colours). **hq4x chosen by the user** (decision 23).
- [x] Smooth motion (session 17, remastered graphics only): `HiResView.beforeTick` keeps the last tick's slots
  before each simulation tick, and every display frame draws positions between the two ticks (`alpha` = the
  loop's leftover time / 25 ms): x in level coordinates against the current scroll x (so the quake still shakes),
  y on the screen; a slot moving more than 32 px per tick snaps. Costs one tick (25 ms) of display latency.
  Classic mode is unchanged (whole ticks).
- [x] Switching classic / remastered (session 17): `Settings.remastered`, saved with the other settings; **R**
  anywhere (first G, changed to R by the user: G starts the hangar cheat), Options line 5 "Grafik: Classic /
  Remastered", and on touch devices an **HD** button top right (left of the fullscreen button; in landscape both
  share the narrow strip right of the picture, so they shrink to fit, 41 px on a phone). gameplay-spec §14.
- [x] Download (session 17): the remastered graphics are never part of the initial download. In classic mode
  nothing under `remaster/` is requested; in remastered mode `HiResView` loads per screen only what it draws
  (a level's chunks around the scroll position, the atlas pages of the sprites on screen, the screen's picture
  and font). The service worker keeps them out of the install cache (`vite.config.ts` REMASTER) and caches each
  file on first use in `dp-remaster-<hash>`, so what a player has seen also works offline.
- [x] Audio remaster tried and **rejected by the user** (decision 24): the CD tracks are mono and band-limited to
  about 10 kHz (aliasing above, so the music was mixed at a low rate before the CD); A/B clips with a higher bitrate,
  pseudo-stereo, AudioSR (neural bandwidth extension; `~/opt/audiosr` and its model cache deleted in session 18) and, for the 8-bit SFX, denoising +
  resampling. The original sounds best; AudioSR adds annoying treble hiss. No original song files exist.
- [x] Abandoned upscaling renders (`remaster/esrgan-anime`, `remaster/animevideo`) deleted (session 18). User
  (session 18): the interpolated motion looks hardly smoother, since the original already moves smoothly; fine.
- [x] Visual effects (session 18, `src/render/fx.ts`, render only, so the gameplay is unchanged): shots and
  explosions glow (a blurred additive copy tinted with the sprite's bright colour, plus a soft halo); explosions
  light the ground around them and start with a flash and sparks; ground explosions leave smoke under the sprites;
  a new shot gets a muzzle flash, a shot ending inside the playfield (a hit) sparks; shadows are soft (each run
  of shadow slots in its own blurred container, so the drawing order stays). What glows is chosen by sprite
  number (shot sprites of players and enemies with their sprite cycles, the explosion animations); events come
  from comparing the drawn sprite tables of two ticks, so pause and freezes stop the particles. Many explosion
  parts at once share one budget, and their light is dimmed by 1/sqrt(count), so the 30-part kinds don't blow out
  to white. Checked with A/B screenshots in headless Chrome (levels 1, 2, 5, with forced explosions).
  At first a third mode (Remastered+Effekte); the user dropped the plain remastered mode (decision 25), so the
  effects are part of Remastered, which is now the default setting. Saved settings from `main` have no
  `remastered` key, so players of the deployed classic-only version get Remastered too. Until a screen's
  remastered files have loaded (or offline, before they were ever cached) the classic picture shows.
- [~] **User:** play with the effects (R twice from classic) and say what to keep, tone down or drop: glow,
  ground light, sparks, muzzle flashes, smoke, soft shadows. First look (session 18): "The effects look cool!",
  only the very bright lasers looked "a bit epileptic": beams (shot sprites at least 3x longer than wide: the
  Duallaser, 8 x 200, re-fired every 10 ticks, and the enemy lasers) were sized by their length (a halo about
  800 px across, a muzzle flash on every re-fire). Now beams get only a dim bloom (alpha 0.35), no halo, light,
  muzzle flash or hit sparks, and other large shots' halos are capped at 8 px radius. Still open: whether that
  is calm enough, and whether it runs smoothly on the phone.
- [x] More effects (session 19, user picked these from a list, `src/render/fx.ts`, render only):
  - **Engine flames** on the jets (Steptokopter excluded: rotors), a cone of soft dots plus an exhaust trail;
    longer when flying forward (thrust from `p.vy` against the engine's max speed). Nozzles are found in each
    banking frame's two lowest pixel rows. Firestorm and Navi Spezial burn orange, the Alien-Pros blue.
  - **Hit feedback:** an enemy whose energy dropped flashes (additive copies of its sprite, drawn right after it,
    so the drawing order stays); a life hit flashes the jet red and the playfield edge red (strength by damage,
    max 0.45, 14 ticks); a shield hit shows a blue ring round the jet, and sparks when the shield is gone. Below
    35 % life the jet trails dark smoke and has a small fire; below about 17 % it also sparks.
  - Burning wrecks (fires, smoke and embers on the wreck sprites) were tried and removed (user, session 19): the
    original wrecks already burn, and the extra fire clashed with their style.
  - **No glow for rockets and bullets** (user, session 19): missiles, the atom bomb, the Rocketlauncher, the
    enemies' darts, missiles and rockets (sprites 146, 168, 184–189, 240, 246, 247, 262) and the MG/Autogun and
    MK Pod rounds and the enemies' pellet and bullet (150, 156, 232, 244) get no bloom, halo or ground light;
    they keep the muzzle flash and hit sparks. Energy shots (balls, lasers, plasma, flames) still glow.
  - Checked with screenshots in headless Chrome (levels 1 and 4, forced hits, low life and kills).
- [x] **User** (session 19): engine flames and hit feedback look good.
- [ ] **User:** play the remastered mode on a 60/120 Hz display and on the phone: does the motion feel right, and
  is the memory use fine (up to ~10 atlas pages of 4096 x 4096 on the GPU)?
- [x] Assets committed (session 18), as AVIF (4:4:4, quality 60): 16 MB instead of 28 MB of WebP (quality 90).
  Level 1 is 1.1 MB instead of 3.0 MB and closer to the lossless upscale (PSNR 42 against 38); WebP below quality
  90 smooths away the dirt grain the user chose hq4x for. A browser without AVIF (Safari before 16.4) keeps the
  classic graphics (`HiResView.use`, Pixi's `detectAvif`). Real-ESRGAN dropped from `tools/remaster_upscale.py`
  (`~/opt/realesrgan` deleted). A tile-based level format was not pursued: hq4x output depends on the tile's
  neighbours, so shared tiles would show seams.
- [x] Prefetch (session 18): in the hangar `HiResView.prefetch` loads the next level's start (background chunks
  24..22, the bottom of the level) and its sprite pages (common + the episode), so they load during the
  briefing. Checked in headless Chrome: loaded before the level starts, its first frames are all remastered.
- [ ] Maybe: now that Remastered is the default, cache the remastered files at install (best effort, like the
  music and videos, +16 MB), so a fresh install plays remastered offline; today a file is cached on first use
  and an unseen level shows classic offline.

## Decisions (user)
1. Classic mode doesn't need to be frame-exact. It must play and feel identical.
2. Language: classic version German only. An English translation can come later in the remastered version (settings switch). The remastered version waits until the classic version is finished.
3. Local two-player is a must.
4. Tech stack confirmed: TypeScript + PixiJS, browser-first.
6. Simulation tick: fixed 40 Hz (measured ≈ 41 fps in the DOSBox-X reference; the original is CPU-bound).
5. Soundtrack split: resolved in session 2 (2 menu, 3 story, 4 intro, 5/6/7 levels, 8 boss, 9 ending).
7. Remaining Phase 1 conversions (FLI → WebM, SFX and music → OGG) wait until the engine scaffold needs them (user, session 4). Session 7: the music and SFX formats are settled (see Phase 1); FLI → WebM still waits.
8. Original bugs are fixed in the remake, including any found later (user, session 4). List: `docs/gameplay-spec.md` §12.
9. No CPU option in the remake; modern machines run the fixed 40 Hz tick (user, session 4).
10. The low-memory "reaper" (`MemoryGuard` @0x1B600) is not replicated (user, session 4).
11. ~~Engine data stays local~~ (a misunderstanding in session 5). **Corrected (user, session 7):** all newly generated assets (sprites, tiles, levels, tables, sounds, soundtrack, videos) are under version control, kept small: compressed browser-friendly formats, no WAV files. Only `original_source/` stays local (until 2026-10-21; since then the original game is committed too, except the disc image).
12. The Golem's curse turns every jet's standard weapon into the Firestorm's basic gun (item 1): intentional, kept (user, session 7).
13. Two players may share one keyboard: a second key set around WASD as an extra control type (user, session 10). The original never let both players use the keyboard.
14. The game should work well on smartphones (landscape) and tablets with touch controls (user, session 11). Publishing on Steam or in the app stores is optional.
15. No Ctrl/Alt/Space in the key legend on any platform (user, session 13): in a browser window the page can't stop the desktop from taking Alt+Space (window menu), Ctrl+Space (input method), Ctrl+Alt+arrows (Linux workspaces) or Ctrl+arrows (macOS), and on Windows AltGr also sends left Ctrl. The arrow player fires with X, switches altitude with C and selects a bonus with V (X+V uses it); the original Ctrl/Alt/Space still work unlisted (best in fullscreen with Keyboard Lock). With a WASD player in the game the arrow player uses , (fire), . (altitude) and - (select; , + - uses), the same on a Mac, and the WASD player X/C/V (left Shift would open Windows' Sticky Keys after five presses).
16. Classic mode may make basic usability changes (user, session 14), e.g. hovering a main menu item selects it. Each deviation from the original is documented in `docs/gameplay-spec.md` §14.
17. Hosting: GitHub Pages (user, session 14). GitLab-flow style: we develop on `main` and publish the `production` branch, which the GitHub Action deploys (`bin/deploy.sh`). The repo was renamed from `dark-planet-remastered` to `dark-planet` for the shorter URL. itch.io may be added later.
18. Polish classic mode before starting the remaster: play it through and fix differences from the original (user, session 11).
19. The intro plays on every start, as with DPMAX.BAT (user, session 17).
20. Square pixels, no 4:3 aspect correction (user, session 17).
21. Ball pods and ramming may damage the level 4/5 boss cores while their parts live, as in the original; only shots are blocked (user, session 17).
22. The ending text leaves out MISSIONS.PAS 123–124 ("Hast du den Cheat schon entdeckt?"), as in the original (user, session 17).
23. Remastered graphics: hq4x (user, session 17), over xbr4 and Real-ESRGAN.
24. Audio stays original (user, session 17): the remastered variants (higher bitrate, pseudo-stereo, AudioSR, cleaned SFX) add nothing or add hiss; the music was recorded in poor quality and no song files exist.
25. Two graphics modes only, Classic and Remastered (always with the effects); Remastered is the default (user, session 18).

## Notes (session 11, polish pass)
- Recordings that would settle open questions (DOSBox-X with `dplanet.conf`, video recording from the Capture menu):
  1. Level 1 boss flying **high** and firing at the legs the whole time: does the escort (legs, 0x24, 180 energy)
     break off? In the remake it does after about 7 s of hits; the existing capture never shows it, but there the
     player may not have hit it at all. **Settled (user, session 17): the remake's level 1 boss matches the original.**
  2. Any of levels 2–6 (a save from the hangar is fine): the only reference for episode 2 so far are 1998 screenshots.
  3. Menus: ~~"Die Geschichte" for 30 s (scroll speed of the text viewer)~~ (fine, user, session 17), ~~and the shop's "Grosse Pods" list~~ (user, session 17: the original has no Rocketlauncher there, as the code reads; the remake keeps offering it, spec §12 #1).

## Notes (session 11, not yet confirmed by the user)
- Touch steering is a floating stick giving the joystick's direction flags (the same acceleration as keyboard
  and joystick). Alternative if it feels wrong: drag steering through the mouse handler (the jet follows the
  finger with an offset, like a captured mouse), at the cost of its 5 x max dead zone.
- Remake additions that also work with a mouse: clicking main menu items and options lines, a click ends the
  scrolling texts and briefings, Esc while paused ends the level.

## Notes (session 10, not yet confirmed by the user)
- Gamepad mapping (a pad has no keypad): A fire, B altitude, X/LB select a bonus, Y/RB use it; left stick
  (dead zone 0.3) or d-pad. The keypad −/+ still select/use for the joystick player.
- A mouse player's pointer is captured (Pointer Lock) while a level runs and released in the menus. Browsers only
  grant the lock after a user gesture, so it's requested when the level starts and again on each click.

## Notes (session 9, not yet confirmed by the user)
- Input is now sampled once per 40 Hz tick, and a key or mouse button pressed and released between two ticks still
  counts for one tick (`Keyboard.sample`, `Mouse.sample`). Found while browser-testing: Chrome ran the
  automated window at 1 frame/s, and quick clicks and taps were lost; short touchpad taps would be lost the same way.
- Shop design choices: the mouse windows clamp the pointer sprite (a browser can't confine or move the real
  pointer), the PC-speaker beeps are left out, a bad save checksum returns to the main menu instead of quitting.
- Per decision 8 the remake lists every shop item (§12 #1) and offers Save on level 1 for 4000 (§12 #6); the
  original doesn't offer it there at all (its price is negative).

## Notes (session 6, not yet confirmed by the user)
- Two new original bugs are fixed per decision 8: §12 #13 (two inventory pickups in one tick lose one) and #14 (bonus shots read and unload mount records out of range).
- Spec corrections from the code: bonuses are picked up only while flying high; atom-bomb kills can drop bonuses; the bonus wobble is 7°·frame; shot patterns 11/22 use angle°, not 2·angle.
- StartBossFight's blocking fades and pause are mapped to 11 + 48 + 11 frozen ticks (our 40 Hz mapping of 20 retraces at 70 Hz and Delay(1200)).
- ~~Levels 2–6 can be started from the placeholder hangar, but their enemy subs and bosses are not ported yet.~~ Ported in session 7.
