# Dark Planet Remastered

*Dark Planet* is a vertical-scrolling arcade shooter in the spirit of Xenon 2 and
Raptor, written in Turbo Pascal around 1997–1998 by three friends and released
on CD-ROM in October 1998. This project brings it back to life as a
cross-platform (browser-first) game with two modes:

- **Classic**: a faithful reproduction of the 1998 original (320×200, original palette, sprites and sounds).
- **Remastered**: the same gameplay with higher-resolution graphics, smooth high-framerate motion and the CD soundtrack.

The original source code is lost, so the gameplay is being reconstructed by
reverse-engineering `DP.EXE`, with the help of an earlier prototype whose
source survived.

## Status
Gameplay reverse-engineered (`docs/gameplay-spec.md`); engine and classic mode in progress (`game/`). See [docs/PLAN.md](docs/PLAN.md) for the roadmap and progress.

## Repository layout
The original game files (`original_source/`) are **not included** in this
repository. The tools expect them at that path in a local checkout.

| Path | Contents |
|---|---|
| `original_source/Game/` | The original game files (DP.EXE, assets, videos) |
| `original_source/CD/` | Contents of the original CD, incl. `Wasndas/` with two earlier games **with source** (`SLY/SLYVERS.PAS` is the Dark Planet prototype) |
| `original_source/Image/` | Disk images of the CD (`DPImage.iso/.bin/.cue/.mdf/.mds`) |
| `original_source/Image/fixed/` | Generated: CD image rebuilt with proper audio tracks (`tools/build_cd_image.py`) |
| `original_source/Screenshots/` | Screenshots of the original |
| `original_source/dplanet.conf` | DOSBox-X config (works on Steam Deck, no music) |
| `original_source/dplanet-cd.conf` | DOSBox-X config that mounts the rebuilt CD, for music |
| `tools/` | Asset extraction and reverse-engineering helpers |
| `game/` | The remake (TypeScript + Vite + PixiJS): `src/sim/` deterministic simulation, `src/render/` classic renderer |
| `game/public/` | Generated, committed game assets: `data/` (engine data, `tools/export_engine_data.py`), `music/` (soundtrack, `tools/export_music.py`), `video/` (intro and ending, `tools/export_videos.py`) |
| `docs/` | Plan, reverse-engineering notes, file formats |

## Playing the original in DOSBox-X (with soundtrack)
```sh
# once: rebuild the CD image with real audio tracks (~330 MB)
python3 tools/build_cd_image.py original_source/Image/DPImage.iso original_source/Image/fixed
# play
cd original_source/Game && dosbox-x -conf ../dplanet-cd.conf
```
The image has 8 audio tracks (2–9). Menu, story, intro, levels, boss and ending each have their own track, and the game loops them. See `docs/re-notes.md`.

## Extracting assets
```sh
uv run --with numpy --with pillow python tools/extract_assets.py original_source /tmp/dp-assets
```
This produces SFX WAVs, the full-screen pictures as PNG, and the soundtrack tracks.

```sh
out=original_source/extracted   # local only, like the rest of original_source/
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
Tastatur, Maus, Joystick = gamepad, or WASD). Keyboard in a level: arrows move, Ctrl or X fires, Alt or C switches
altitude, Space selects a bonus, Ctrl+Space (or X+Space) uses it. WASD (a second player on the same keyboard):
W/A/S/D move, left Shift fires, Q switches altitude, E selects, Shift+E uses; meanwhile the arrow player uses right
Ctrl (fire), right Alt (altitude) and right Shift (select; right Ctrl + right Shift uses). Mouse: the jet follows the pointer, left fires,
right switches altitude, middle selects a bonus, left+middle uses it. Gamepad: stick or d-pad, A fires, B switches
altitude, X/LB selects, Y/RB uses. P pauses, Esc aborts to the menu. F toggles fullscreen (in Chrome with Keyboard
Lock, so desktop shortcuts don't take Ctrl/Alt combinations). The whole game plays through, including the shop,
saves, two players and the ending (see `docs/PLAN.md` Phase 3 for what is left to check).

The game's assets are generated from `original_source/` and committed, so the game runs from a plain checkout:
`game/public/data/` (sprites, tiles, menu pictures, fonts, texts, levels, tables and SFX; binaries gzip-compressed) and
`game/public/music/` (CD tracks 2–9 as mono MP3) and `game/public/video/` (intro and ending as WebM). To regenerate
them (needs `original_source/`, `uv` and ffmpeg): `npm run data`, `npm run music` and `npm run video`.

## Docs
- [docs/PLAN.md](docs/PLAN.md): goals, architecture, phases, open questions
- [docs/re-notes.md](docs/re-notes.md): reverse-engineering findings ledger
- [docs/file-formats.md](docs/file-formats.md): original file formats
- [docs/gameplay-spec.md](docs/gameplay-spec.md): gameplay rules for the classic mode, in 40 Hz ticks
