# Development

## Repository layout
| Path | Contents |
|---|---|
| `original_source/` | The original 1998 game and CD, untouched (see [original-game.md](original-game.md)) |
| `game/` | The remake (TypeScript + Vite + PixiJS): `src/sim/` deterministic simulation, `src/render/` classic and remastered renderers, `src/screens/` menus, hangar, shop and levels, `src/input/` keyboard, mouse, gamepad and touch, `src/sly/` the 1997 prototype, `test/` Vitest tests |
| `game/public/` | Generated, committed game assets: `data/` (engine data, `tools/export_engine_data.py`), `sly/` (the 1997 prototype's data, `tools/export_sly_data.py`), `music/` (soundtrack, `tools/export_music.py`), `remaster/hq4x/` (4x graphics as AVIF, `tools/remaster_upscale.py`), `video/` (intro and ending, `tools/export_videos.py`), `icons/` (app icons, `tools/export_icons.py`) |
| `tools/` | Asset extraction, remastering and reverse-engineering helpers; `tools/dosbox/` holds the XMS workaround for DOSBox-X |
| `docs/` | Plan, reverse-engineering notes, specs; `images/` = README pictures (from `tools/screenshots.mjs`) |
| `bin/deploy.sh` | Publishes the game (see Hosting) |

## Running the remake
```sh
cd game
npm install
npm run dev    # http://localhost:5173
npm test       # simulation tests
```
The controls are in [controls.md](controls.md).

The game's assets are generated from `original_source/` and committed, so the game runs from a plain checkout:
`game/public/data/` (sprites, tiles, menu pictures, fonts, texts, levels, tables and SFX; binaries gzip-compressed),
`game/public/music/` (CD tracks 2–9 as mono MP3), `game/public/video/` (intro and ending as WebM) and
`game/public/remaster/hq4x/` (the remastered graphics: levels, sprites, pictures and fonts upscaled 4x with hq4x). To regenerate
them (needs `original_source/`, `uv` and ffmpeg): `npm run data`, `npm run music`, `npm run video`, `npm run icons`
and `npm run sly`; the remastered graphics come from `tools/remaster_upscale.py`.

## Testing shortcuts
- **GEDANKE** typed in the hangar sets both players' money to 666666, so the shop can sell anything. This cheat is
  in the original game and works in every build.
- **1–6** in the hangar start that level right away, without the briefing. **Shift+1–6** start it at the boss
  fight. These keys work only on the dev server (`npm run dev`), not in the production build. They are not in the
  original game. Finishing a level returns to the hangar with the next level selected, as usual.

## The prototype (Sly version, 1997)
A hidden extra, not listed in the game's menus (and not in the Steam release): `sly.html`, the 1997 prototype
`SLYVERS.PAS` (`original_source/CD/Wasndas/SLY/`, source preserved) ported to TypeScript in `game/src/sly/`, with a
friend's photo as the boss. One level; arrows move, X or Ctrl fires, Esc ends it (then Enter plays again, Esc
returns to Dark Planet). Direct link: https://aimfeld.github.io/dark-planet/sly.html. Its data is in
`game/public/sly/` (`npm run sly`, `tools/export_sly_data.py`).

## Screenshots
`node tools/screenshots.mjs [scenario ...]` (needs `google-chrome`) plays scripted levels, boss fights and the menus
in headless Chrome and writes store screenshots to `screenshots/` (gitignored): every moment as `classic/<name>.png`
and `remastered/<name>.png` (1920 x 1200), with `index.html` to compare and pick them. The scenarios (levels,
jets, pods) are in `game/src/screenshots.ts`.

## Gameplay videos
On the dev server every level you play is recorded: the world at the level start plus each tick's input, saved to
`recordings/level<N>-<time>.json` (gitignored; the browser console says when). A pause isn't recorded.
`node tools/trailer.mjs recordings/<file>.json [--from s] [--to s]` replays it in headless Chrome and writes
`videos/<file>-remastered.mp4` and `-classic.mp4` (gitignored): 1920 x 1080 at 60 fps, H.264 + AAC, the picture
5.4x with black bars, the sound effects from the game's mixer and the CD track lossless from the disc image (needs
`original_source/Image/DPImage.iso`, see [original-game.md](original-game.md)). Both modes show the same moment at
the same frame, so they can be cut together. `--lang`, `--mode`, `--jobs` (parallel browsers),
`--music-db`/`--sfx-db` and the rest: see the tool's header.

## Installing as an app (PWA)
The production build (`npm run build`, output in `game/dist/`) is an installable web app: `manifest.webmanifest`
plus a service worker (`game/sw.js`, written to `dist/sw.js` with the file list by `vite.config.ts`) that caches
the game with its music and videos when it's installed (the remastered graphics and the prototype as they are
first used), so the installed app also plays offline. On Android Chrome:
menu → "Install app"; on iPhone/iPad Safari: Share → "Add to Home Screen". Browsers only allow this over HTTPS (or
on `localhost`), so a phone needs the build served over HTTPS, e.g. `npx vite preview --host` behind
`tailscale serve`, or the public build on GitHub Pages. The dev server (`npm run dev`) doesn't register the
service worker.

## Hosting
The game is published on GitHub Pages: https://aimfeld.github.io/dark-planet/

We develop on `main` and publish the `production` branch. `bin/deploy.sh` checks that `main` is clean and pushed,
runs the tests and the build, then fast-forwards `production` to `main` and pushes both. The push to
`production` starts `.github/workflows/deploy.yml`, which builds `game/` and deploys it. The script follows the
run if the GitHub CLI (`gh`) is installed. Only `production` may deploy to Pages.
