# Dark Planet Remastered

![Dark Planet Remastered: the title picture, level 2, level 5 and the level 4 boss](docs/images/screenshots.jpg)

**▶ Play it in your browser: https://aimfeld.github.io/dark-planet/**

*Dark Planet* is a vertical-scrolling arcade shooter in the spirit of Xenon 2 and
Raptor, written in Turbo Pascal around 1997–1998 by three friends and released
on CD-ROM in October 1998. This project brings it back to life as a
cross-platform (browser-first) game with two modes:

- **Classic**: a faithful reproduction of the 1998 original (320×200, original palette, sprites and sounds).
- **Remastered**: the same gameplay with higher-resolution graphics, smooth high-framerate motion, and visual effects.

The original source code is lost, so the gameplay is being reconstructed by
reverse-engineering `DP.EXE`, with the help of an earlier prototype whose
source survived.

## Status
Gameplay reverse-engineered (`docs/gameplay-spec.md`); classic mode done, remastered mode (4x hq4x graphics, smooth motion, effects; the default) in `game/`. See [docs/PLAN.md](docs/PLAN.md) for the roadmap and progress.

## Repository layout
The original game is included (`original_source/`, about 75 MB; `Game/` and `CD/` share their files), so a clone plays it in DOSBox-X. Only the
disc image `original_source/Image/DPImage.iso` (330 MB) is not committed: `tools/build_cd_image.py`,
`tools/export_music.py` and `extract_assets.py`'s soundtrack need it. Download it from the
[`disc-image` release](https://github.com/aimfeld/dark-planet/releases/tag/disc-image) (77 MB) and unpack it:
`xz -dc DPImage.iso.xz > original_source/Image/DPImage.iso`.

| Path | Contents |
|---|---|
| `original_source/Game/` | The installed original game (DP.EXE, assets, videos; the CD's `DPlanet/` and `Video/` plus SAVE.DAT and SETTINGS.DAT) |
| `original_source/CD/` | Contents of the original CD (its data track), incl. `Wasndas/` with two earlier games **with source** (`SLY/SLYVERS.PAS` is the Dark Planet prototype) |
| `original_source/Screenshots/` | Screenshots of the original |
| `original_source/dplanet.conf` | DOSBox-X config (see below) |
| `original_source/cdaudio/` | The CD for DOSBox-X: `dplanet.cue` = a placeholder data track + the soundtrack MP3s from `game/public/music/` |
| `original_source/save/` | Created by playing: what the game writes (settings, saves), a DOSBox-X overlay over `Game/` (not committed) |
| `original_source/Image/` | Local only: `DPImage.iso` (data track + all CD audio as one track); `fixed/` = the image rebuilt with proper audio tracks (`tools/build_cd_image.py`) |
| `tools/` | Asset extraction and reverse-engineering helpers; `tools/dosbox/` holds the XMS workaround for DOSBox-X |
| `game/` | The remake (TypeScript + Vite + PixiJS): `src/sim/` deterministic simulation, `src/render/` classic renderer |
| `game/public/` | Generated, committed game assets: `data/` (engine data, `tools/export_engine_data.py`), `sly/` (the 1997 prototype's data, `tools/export_sly_data.py`), `music/` (soundtrack, `tools/export_music.py`), `video/` (intro and ending, `tools/export_videos.py`), `icons/` (app icons, `tools/export_icons.py`) |
| `docs/` | Plan, reverse-engineering notes, file formats; `images/` = README pictures (from `tools/screenshots.mjs`) |

## Playing the original in DOSBox-X (with soundtrack)
```sh
dosbox-x -conf original_source/dplanet.conf      # from any directory
# DOSBox-X from Flathub: its launcher changes to $HOME, so start the binary directly
flatpak run --command=/app/bin/dosbox-x com.dosbox_x.DOSBox-X -nopromptfolder -conf original_source/dplanet.conf
```
Tested with DOSBox-X 2026.10.01 (Flathub `com.dosbox_x.DOSBox-X`; the Flatpak sees only your home folder, so a
clone elsewhere needs `--filesystem=<path>`). The config mounts `Game/` as C: with `save/` as overlay (the
committed files stay unchanged), mounts `cdaudio/dplanet.cue` as D: and runs `DPMAX.BAT`'s steps (CD track 4,
intro video, game, ending). It also runs `tools/dosbox/XMSHOLE.COM` before the game, a workaround for a DOSBox-X
XMS bug that otherwise garbles the sound effects (see `tools/dosbox/xmshole.s`).
The CD has 8 audio tracks (2–9). Menu, story, intro, levels, boss and ending each have their own track, and the
game loops them. See `docs/re-notes.md`.

## Extracting assets
```sh
uv run --with numpy --with pillow python tools/extract_assets.py original_source /tmp/dp-assets
```
This produces SFX WAVs, the full-screen pictures as PNG, and the soundtrack tracks.

```sh
out=original_source/extracted   # local only (gitignored)
uv run --with numpy --with pillow python tools/extract_sprites.py original_source $out  # sprite sheets + sprites.json
uv run --with numpy --with pillow python tools/extract_fonts.py original_source $out    # fonts
uv run --with numpy --with pillow python tools/render_levels.py original_source $out    # full levels, spawn maps, levels.json
python3 tools/enemy_table.py original_source --json $out/enemies.json                   # enemy, enemy-shot and sprite-cycle tables
python3 tools/game_tables.py original_source $out/game_tables.json --check            # every gameplay table for the engine
```

## Running the remake (work in progress)
```sh
cd game
npm install
npm run dev    # http://localhost:5173
npm test       # simulation tests
```
After a key or click the intro plays (any key skips it). Main menu: arrows and Enter. The hangar works with the
mouse ("Shoot em all" starts the next level, "Multiplayer" adds player 2, "Optionen" sets each player's controls:
Tastatur, Maus, Joystick = gamepad, WASD or Touch). Keyboard in a level: arrows move, X fires, C switches
altitude, V selects a bonus, X+V uses it (the original's Ctrl, Alt and Space work too, but in a window the desktop
takes some of their combinations). WASD (a second player on the same keyboard; player 2's default):
W/A/S/D move, X fires, C switches altitude, V selects, X+V uses; meanwhile the arrow player uses
the three keys left of right Shift: , fires, . switches altitude, - selects, , + - uses. Mouse: the jet follows the pointer, left fires,
right switches altitude, middle selects a bonus, left+middle uses it. Gamepad: stick or d-pad, A fires, B switches
altitude, X/LB selects, Y/RB uses. Touch (the default on phones and tablets): a stick appears under the left thumb,
the buttons on the right fire (double tap: autofire), switch altitude, select and use a bonus; ❚❚ pauses, ✕ in the
pause ends the level; in the menus tap the items, a long press is the right mouse button. P pauses, Esc aborts to the menu. F toggles fullscreen (in Chrome with Keyboard
Lock, so desktop shortcuts don't take Ctrl/Alt combinations). Each player's controls (player 2 in multiplayer) are listed
below the picture. macOS takes Ctrl+arrows (Spaces, Mission Control) even then; to fire with Ctrl on a Mac, turn off
"Mission Control", "Application windows" and "Move left/right a space" in System Settings → Keyboard → Keyboard
Shortcuts → Mission Control. The whole game plays through, including the shop,
saves, two players and the ending (classic mode is done; `docs/PLAN.md` Phase 3 lists a few optional checks).

The game's assets are generated from `original_source/` and committed, so the game runs from a plain checkout:
`game/public/data/` (sprites, tiles, menu pictures, fonts, texts, levels, tables and SFX; binaries gzip-compressed) and
`game/public/music/` (CD tracks 2–9 as mono MP3) and `game/public/video/` (intro and ending as WebM). To regenerate
them (needs `original_source/`, `uv` and ffmpeg): `npm run data`, `npm run music`, `npm run video` and `npm run icons`.

### The prototype (Sly version, 1997)
A hidden extra, not listed in the game's menus (and not in the Steam release): `sly.html`, the 1997 prototype `SLYVERS.PAS`
(`original_source/CD/Wasndas/SLY/`, source preserved) ported to TypeScript in `game/src/sly/`, with a friend's
photo as the boss. One level; arrows move, X or Ctrl fires, Esc ends it (then Enter plays again, Esc returns to
Dark Planet). Direct link: https://aimfeld.github.io/dark-planet/sly.html. Its data is in `game/public/sly/`
(`npm run sly`, `tools/export_sly_data.py`).

### Testing shortcuts
- **GEDANKE** typed in the hangar sets both players' money to 666666, so the shop can sell anything. This cheat is
  in the original game and works in every build.
- **1–6** in the hangar start that level right away, without the briefing. **Shift+1–6** start it at the boss
  fight. These keys work only on the dev server (`npm run dev`), not in the production build. They are not in the
  original game. Finishing a level returns to the hangar with the next level selected, as usual.

### Screenshots
`node tools/screenshots.mjs [scenario ...]` (needs `google-chrome`) plays scripted levels, boss fights and the menus
in headless Chrome and writes store screenshots to `screenshots/` (gitignored): every moment as `classic/<name>.png`
and `remastered/<name>.png` (1920 x 1200), with `index.html` to compare and pick them. The scenarios (levels,
jets, pods) are in `game/src/screenshots.ts`.

### Gameplay videos
On the dev server every level you play is recorded: the world at the level start plus each tick's input, saved to
`recordings/level<N>-<time>.json` (gitignored; the browser console says when). A pause isn't recorded.
`node tools/trailer.mjs recordings/<file>.json [--from s] [--to s]` replays it in headless Chrome and writes
`videos/<file>-remastered.mp4` and `-classic.mp4` (gitignored): 1920 x 1080 at 60 fps, H.264 + AAC, the picture
5.4x with black bars, the sound effects from the game's mixer and the CD track lossless from the disc image (needs
`original_source/Image/DPImage.iso`). Both modes show the same moment at the same frame, so they can be cut
together. `--lang`, `--mode`, `--jobs` (parallel browsers), `--music-db`/`--sfx-db` and the rest: see the tool's header.

### Installing as an app (PWA)
The production build (`npm run build`, output in `game/dist/`) is an installable web app: `manifest.webmanifest`
plus a service worker (`game/sw.js`, written to `dist/sw.js` with the file list by `vite.config.ts`) that caches
the whole game (about 28 MB with music and videos), so the installed app also plays offline. On Android Chrome:
menu → "App installieren"; on iPhone/iPad Safari: Teilen → "Zum Home-Bildschirm". Browsers only allow this over
HTTPS (or on `localhost`), so a phone needs the build served over HTTPS, e.g. `npx vite preview --host` behind
`tailscale serve`, or the public build on GitHub Pages. The dev server (`npm run dev`) doesn't register the
service worker.

### Hosting
The game is published on GitHub Pages (link at the top).

We develop on `main` and publish the `production` branch. `bin/deploy.sh` checks that `main` is clean and pushed,
runs the tests and the build, then fast-forwards `production` to `main` and pushes both. The push to
`production` starts `.github/workflows/deploy.yml`, which builds `game/` and deploys it. The script follows the
run if the GitHub CLI (`gh`) is installed. Only `production` may deploy to Pages.

## Docs
- [docs/PLAN.md](docs/PLAN.md): goals, architecture, phases, open questions
- [docs/re-notes.md](docs/re-notes.md): reverse-engineering findings ledger
- [docs/file-formats.md](docs/file-formats.md): original file formats
- [docs/gameplay-spec.md](docs/gameplay-spec.md): gameplay rules for the classic mode, in 40 Hz ticks
