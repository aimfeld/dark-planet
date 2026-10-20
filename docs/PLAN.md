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
- [ ] **User:** play through `dplanet-cd.conf` and check the music: menu = track 2, levels 1–3 = tracks 5–7, boss = track 8, and tracks loop. Optionally confirm by ear that track 8 starts at 21:57 (1317 s) and not at 22:08.
- [–] ~~Fix DOSBox-X audio~~: **decision (user, session 2): not needed.** The target is the TypeScript version. In DOSBox-X the CD music plays fine with `dplanet-cd.conf` (confirmed by the user; an earlier choppiness came from a runaway analysis script loading the host CPU). Only the SFX are garbled (a known DOSBox issue; the user decoded the SFX correctly in Python before). Game speed is fine with `dplanet.conf`. DOSBox-X stays a reference for gameplay and visuals, not for audio.
- [x] SFX format verified in DP.EXE (session 3): signed 8-bit, 11025 Hz. `extract_assets.py` assumed unsigned 22050 Hz and is fixed.
- [x] **User:** corrected SFX WAVs sound right (session 3).
- [x] Decode AniVGA `.LIB` sprites → PNG sheets + `sprites.json` (`tools/extract_sprites.py`, numbers as DP.EXE loads them).
- [x] Decode `.FNT` fonts → PNG + widths (`tools/extract_fonts.py`).
- [x] **User:** sprite sheets, fonts and level renders match the game (session 3).
- [x] Decode `.LEV` (tile grid + 600 spawn records) + `TI1/TI2.LIB` → full level PNGs, spawn maps with enemy sprites, `levels.json` (`tools/render_levels.py`). Tileset per episode: TI1 for levels 1–3, TI2 for 4–6.
- [x] Soundtrack → MP3 (session 7): `tools/export_music.py` → `game/public/music/track02–09.mp3`, mono (both channels are identical), LAME VBR -V5, 12 MB in total. MP3 rather than OGG/Opus because Safari still decodes Ogg/WebM Opus unreliably (especially in Web Audio). Not yet played by the game.
- [x] Generated assets under version control (session 7, decision 11 corrected): engine binaries as reproducible `*.bin.gz` (unpacked with `DecompressionStream`; the loader also accepts data a server already unpacked via `Content-Encoding: gzip`, as Vite's dev server does), JSON plain. SFX stay lossless 8-bit PCM inside `sounds.bin.gz` (700 KB) instead of OGG.
- [ ] **User:** listen to a few `game/public/music/*.mp3` tracks; if -V5 mono sounds too lossy, raise `LAME_VBR_QUALITY` (-V4 adds about 15 %).
- [x] FLI videos → WebM (session 10): `tools/export_videos.py` → `game/public/video/intro.webm` (12.6 MB) and `ending.webm` (1.1 MB), AAPLAY's playlists with loops and white flashes baked in (RE in re-notes "Intro and ending videos").
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
- [x] Menus, text viewer, mission briefings, ending text, options, shop screen and load/save flow (session 8, static RE by three parallel forks): re-notes "Main menu, hangar, options", "Text viewer…", "Shop screen and load/save". Fonts: FIRE (HUD), SUPER (text viewer), _BROADWA (hangar, options), DEFAULT (shop). Palettes: HMBILD/UMBILD own .PAL, OMBILD and RASTER use EPIS1.
- [ ] DOSBox-X checks for the menus: real frame time of the text viewer (scroll speed of story/about/ending), whether 39+ character lines are clipped at x 319.

### Phase 3: Engine + classic mode 🔄
- [x] Project scaffold (session 5): `game/` with Vite + TypeScript + PixiJS + Vitest. Fixed 40 Hz loop in `src/main.ts`, separate from rendering (catch-up capped at 8 ticks). Keyboard input (original keys plus X = fire, C = altitude, because browsers grab Ctrl/Alt combinations). Engine data from `tools/export_engine_data.py` into `game/public/data/` (local only, gitignored like `original_source/`; `npm run data`).
- [x] Deterministic simulation `game/src/sim/` (session 5): ported from the DP.EXE routines, laid out like the original (an AniVGA-style sprite slot table plus the player/enemy/shot records). Own TP `Random`, `Round` and a sin/cos built from IEEE arithmetic only, so it runs identically on every JS engine. Test: two runs with the same seed and input give the same state.
- [x] Classic renderer (session 5): 320×200 indexed framebuffer drawn like AniVGA `Animate` (slots 920→0, playfield clip x 8–311, HUD slots 0–8 unclipped, shadow mode through the `SetShadowTab(70)` table), EPIS1 palette, integer nearest-neighbour scaling with square pixels.
- [x] First playable slice (session 5): level 1 scrolling with tiles; spawning from the level records; player movement, altitude and draw-order swap, shadows; Firestorm and the other standard weapons and simple pods; enemy subs used in level 1 (0–6, 9–0x11) with their guns and enemy shots (patterns 1–5, 8–16, 18, 20); hit test, shot/enemy-shot/ramming collisions, damage, death, respawn and invulnerability; explosions, sprite animations and cycles; HUD bars, money and lives. Level 1 runs to the boss trigger (scroll stops at y −5561). Side by side with the DOSBox-X capture `dp_002.avi` at scrollY −1349: tiles and spawned objects line up exactly.
- [ ] **User:** play the slice (`cd game && npm run data && npm run dev`) next to DOSBox-X and report what feels different (speed, steering, enemy paths, shot speeds).
- [ ] Decide: square pixels (now) or 4:3 aspect correction (320×200 shown as 320×240, as on a CRT).
- [x] Audio (session 6): the SFX are exported as signed 8-bit PCM (`sounds.bin` + `sounds.json`, index = PlaySound number; raw PCM instead of OGG, decision 7 left the format open) and played with Web Audio at 11025 Hz (`src/audio/sfx.ts`): looped sounds and stops, SMIX's 32 voices and the original's voice-count conditions (shots < 5, enemy fire < 4, explosions < 7, "only if not playing"). CD music later.
- [x] Fullscreen key F with the Keyboard Lock API (session 6, `src/input/fullscreen.ts`; all keys locked, so Chrome asks to hold Esc to leave fullscreen). X/C stay as alternates.
- [x] macOS (user, session 12, Brave): Ctrl+arrows switch Spaces / open Mission Control even in fullscreen with Keyboard Lock; a page can't stop that. The README explains how to turn the shortcuts off in System Settings.
- [x] Key legend below the picture (user, session 12; `src/input/keyLegend.ts`): one line per player (P2 only in multiplayer) with that player's control type: arrows (the right-hand keys while a WASD player plays), mouse buttons, gamepad buttons and keypad −/+, WASD; then P / Esc / F, in the manual's words (ballern, hoch/tief, Bonus selektieren/abfeuern). During the intro and ending videos it says how to skip them (any key or a click); it keeps two lines' height so the picture doesn't change size when a video ends. It lists X/C/V for the arrow player on every platform, not the original Ctrl/Alt/Space (decision 15). The integer-scaled picture keeps room for it (`ClassicView.setBelow`), so on a 1440x900 Mac in fullscreen the scale drops from 9 to 8 device pixels. Hidden with touch controls. Checked in Chrome (main menu, arrows + WASD).
- [x] P2 defaults to WASD (user, session 12; the original's default is mouse), so two players can share a keyboard without visiting the options. Saved settings keep their choice; touch devices still default to P1 touch, P2 keyboard.
- [x] ~~Mac, two players on one keyboard (session 12): right Option fires, the key left of right Shift switches altitude.~~ Replaced in session 13 by , . - on every platform (decision 15). Right Cmd stays avoided: macOS sends no keyup for other keys while Cmd is held, so arrows would stick.
- [ ] **User:** in Chrome on Linux Mint/Cinnamon, press F and check whether Ctrl+Alt+arrows now reach the game instead of switching workspaces (theory: an active X11 keyboard grab beats the window manager's passive key grabs).
- [x] Remaining level-1 content (session 6): bonus drops, wobbling objects, pickups (only while flying high), the 3-slot inventory (Space selects, Ctrl+Space uses), all 10 bonus effects with shot patterns 10–13 and 22, the atom bomb's grey flash, ×5 damage; StartBossFight (clearing, fades, parts in fixed slots, frozen ticks), the level 1 boss (sub 0x14, scripted 3-way fire, hit sounds), the core's death and the level-end autopilot; game over ("Loser!", 120-tick countdown); a placeholder flow main menu → level → fade → hangar → next level (`src/game.ts`).
- [ ] **User:** play level 1 to the end (bonuses, boss, level end, game over) and report differences; listen to the sounds.
- [x] Remaining weapons (session 7): Autogun targeting (Nearest(1)), Flamer (flame anim, glued to its pod), G-Destructor scatter, ball pods (orbit, firing, enemy-shot removal, contact damage); all 24 shot patterns are ported. Found on the way: anim 5 belongs to the Flamer, not the Missiles; the ball orbit is k°/tick, not 2k°. New original bugs §12 #15 (aimed-shot 16-bit overflow) and #16 (ball-pod explosion altitude); fixes #2 (Distroyer reload 10) and #3 (P2's ball pod damages) are in. `test/weapons.test.ts`.
- [ ] **User:** decide whether ball pods (and ramming) may damage the level 4/5 boss cores while their parts live. The original allows it (only shots are blocked); the remake does the same for now.
- [x] Episode 2 and the bosses (session 7): all 43 enemy subs, all 22 enemy-shot patterns, Direction8 and Nearest(2), the per-type hooks (snake facing and head fire, turret facing, parts riding on the cores), BossScript for levels 2–6 (`src/sim/bosses.ts`: level 2 core dropping to the ground, snake shortening from the back, tank, fortress, Golem intro/curse/teleport/rocks/bounce/lasers/death), Quake's sound 14. Levels 2–6 play through to their bosses (`test/bosses.test.ts`). Fixes per decision 8: §12 #7–9 (session 4 list) and new #17 (snake ghost sprite), #18 (dead Golem paid again), #19 (snake refill without the 2P bonus). Spec correction: the curse also turns the standard weapon into item 1, the Firestorm's gun.
- [ ] **User:** play levels 2–6 (episode 2 enemies, all five bosses) and report differences.
- [x] **User:** the Golem curse turning every jet's standard weapon into the Firestorm's gun is intentional (decision 12).
- [x] Menus (session 8): main menu, text viewer (story, manual, about, briefings, ending text), hangar with doors, labels, Multiplayer join and the GEDANKE cheat, options (stored in browser storage), CD music (`src/audio/music.ts`, tracks loop like CDRepeat; level, boss and menu tracks). The menus are generator coroutines (`src/screens/`) that yield the milliseconds each step takes, so they keep the original's Delay(15) loop passes and 70 Hz fades while the levels keep the 40 Hz tick. Exporter: `pictures.bin.gz` (HMBILD/UMBILD/OMBILD/RASTER), the menu palettes, all four fonts, `texts.json`. `test/menus.test.ts` (screens dumped to `test-output/menu-*.bmp`).
- [ ] **User:** try the menus (`cd game && npm run dev`): main menu glow and keys, story/manual/about, hangar doors and labels, briefing slide-in, options, CD music switching (menu → level → boss → menu).
- [x] Shop and save/load (session 9): `src/screens/shop.ts` ports 1d9e:84BC with all its helpers (offers, buy with the large-pod placement on the pointer, sell, position change, player switch, money exchange, INFO.PAS texts, shadowed unaffordable offers), `src/save.ts` reads/writes the original 129-byte SAVE.DAT with its checksum (browser storage, base64; the original sample loads). Main menu "Spiel laden" works; a bad checksum shows the "Schlitzohr" message. New RE in re-notes "Shop rules (session 9)" (corrections: 272c:00DC is "button held", empty/unaffordable boxes ignore clicks, info lines are sprites 826+k, the item header has no offset). `test/shop.test.ts` drives it through the hangar; checked live in Chrome (cheat, buy + place a pod, Save, reload, load).
- [ ] **User:** try the shop (hangar → Shop; GEDANKE for money): buying and placing large pods, selling, Position wechseln, jets, boni, Save + "Spiel laden", and with two players the PLAYER switch and GELD AUSTAUSCH.
- [x] Two players and control types (session 10): the mouse (0x1A34B) and joystick (0x1A58F) handlers are ported (`playerInput` in `src/sim/player.ts`); each player reads the device chosen in the options (`src/input/players.ts`). Gamepad API as the joystick (`src/input/gamepad.ts`), pointer lock for a mouse player during levels with the real pointer as fallback. `test/input.test.ts`; checked in Chrome with P1 mouse + P2 keyboard, then P2 on a mocked gamepad (pointer lock itself can't be granted in the automated tab).
- [ ] **User:** play with the mouse (Options → Steuerung Player1: Maus): does the pointer get captured on entering a level (or on the first click), does the steering feel right? And with a gamepad as Joystick if you have one.
- [x] Two players on one keyboard (decision 13, session 10): control type 4 "WASD" in the options (W/A/S/D move, X fires, C altitude, V selects a bonus, X + V uses it; until session 13 left Shift, Q and E). While a WASD player is in the game, the arrow player uses only the keys right of the space bar (since session 13, decision 15: Comma fires, Period switches altitude, the key left of right Shift (code `Slash`, - on German/Swiss keyboards) selects, Comma + Minus uses; before that right Ctrl/Alt/Shift), so neither player can trigger the other. Checked in Chrome with P1 arrows + P2 WASD.
- [ ] **User:** try two players on one keyboard (Optionen → Steuerung Player2: WASD).
- [x] Intro and ending videos (session 10): the game starts behind a "Taste oder Klick zum Starten" prompt (browsers need a gesture for sound), then plays the intro with CD track 4 (DPMAX.BAT), then the main menu; after the ending text the ending video plays with track 9, then the main menu. A key or click skips a video. `src/video.ts`, `src/screens/video.ts`, `test/video.test.ts`.
- [ ] **User:** watch the intro and the ending (`npm run dev`; the ending: finish level 6, or call `game` in the console) and check the white flashes, the logo hold and the music; say whether the intro should play on every start.

- [x] Touch controls for phones and tablets (session 11, decision 14): control type 5 "Touch" (`src/input/touch.ts`), the default on devices whose primary pointer is a finger. An HTML overlay beside the picture: a floating stick on the left (direction flags like the joystick, 8 directions), Feuer / Höhe / Bonus wählen / Bonus feuern on the right (a finger can slide between them; a double tap on Feuer locks autofire, the next tap releases it). Layout: beside the picture in landscape, below it in portrait, clear of the notch (`viewport-fit=cover`, safe-area insets); the picture fills the free space (non-integer scale). Menus take taps: main menu items, options lines, taps end the story/about/briefing/ending, the manual and the Multiplayer question offer their keys as buttons (`Ctx.touchKeys`), a long press is the right button (cancels a pod in the shop). Levels have a pause button; Esc (✕) while paused ends the level. Leaving the app pauses the level and silences the music. Fullscreen button with landscape lock where supported (not on iPhone: "Zum Home-Bildschirm" with the new `manifest.webmanifest` instead). Sound starts on `pointerup`/`touchend` (a touch's `pointerdown` doesn't count as a gesture). `test/touch.test.ts`; checked in headless Chrome emulating a phone (landscape and portrait) and a tablet: start, intro, menu, hangar, briefing, steering, firing, autofire, pause, ✕.
- [~] **User:** play on a real phone and tablet (`npm run dev -- --host`, open the LAN address, or serve it over Tailscale): works on the user's Android phone (session 11). Still open: a tablet, an iPhone, and feedback on the steering feel, button sizes and places, autofire double tap, the shop with taps and long press.
- [ ] Check the intro/ending WebM (VP9) on iPhone/iPad Safari; add an MP4 fallback if it doesn't play.
- [x] PWA (session 12): icons cut from the title picture (HMBILD, both jets and the fire; `tools/export_icons.py` → `public/icons/`, 192/512 px "any" and "maskable", apple-touch-icon, favicon), manifest with `id`, icons, description. Service worker `game/sw.js`: the build (`offlinePlugin` in `vite.config.ts`) prepends the list of built files and content hashes and writes `dist/sw.js`. Install caches the core (app shell, Pixi chunks, `data/`, about 2 MB) in `dp-core-<hash>`, and the music and videos (26 MB) best effort in `dp-media-<hash>`, so a code update doesn't download them again; a media file missing there is cached after its first use. Cache first; navigations get `index.html`; `<audio>`/`<video>` range requests get 206 slices of the cached file (Safari needs them). `skipWaiting` + `clients.claim`: an update takes over in the background (a running game has loaded its code and data at boot). Registered only in production builds, after the data has loaded; also asks for persistent storage (saves). Checked in headless Chrome 155 against `vite preview`: no manifest or installability errors, both caches filled, an offline reload reaches the start prompt, music seeks and the intro video loads offline, ranges (incl. suffix ranges) answer 206.
- [ ] **User:** install the app on the phone (needs HTTPS: the build behind `tailscale serve`, or a static host) and play once offline; check the icon on the home screen and that iOS opens it without the Safari bars.
- [ ] Hosting the build (GitHub Pages or similar), so the app can be installed from a public URL.

### Phase 4: Remastered mode
- [ ] Interpolated high-refresh renderer, upscaled assets, effects, streamed music, mode switch in the menu.

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
11. ~~Engine data stays local~~ (a misunderstanding in session 5). **Corrected (user, session 7):** all newly generated assets (sprites, tiles, levels, tables, sounds, soundtrack, videos) are under version control, kept small: compressed browser-friendly formats, no WAV files. Only `original_source/` stays local.
12. The Golem's curse turns every jet's standard weapon into the Firestorm's basic gun (item 1): intentional, kept (user, session 7).
13. Two players may share one keyboard: a second key set around WASD as an extra control type (user, session 10). The original never let both players use the keyboard.
14. The game should work well on smartphones (landscape) and tablets with touch controls (user, session 11). Publishing on Steam or in the app stores is optional.
15. No Ctrl/Alt/Space in the key legend on any platform (user, session 13): in a browser window the page can't stop the desktop from taking Alt+Space (window menu), Ctrl+Space (input method), Ctrl+Alt+arrows (Linux workspaces) or Ctrl+arrows (macOS), and on Windows AltGr also sends left Ctrl. The arrow player fires with X, switches altitude with C and selects a bonus with V (X+V uses it); the original Ctrl/Alt/Space still work unlisted (best in fullscreen with Keyboard Lock). With a WASD player in the game the arrow player uses , (fire), . (altitude) and - (select; , + - uses), the same on a Mac, and the WASD player X/C/V (left Shift would open Windows' Sticky Keys after five presses).

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
