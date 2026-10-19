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
Investigation and tooling phase. See [docs/PLAN.md](docs/PLAN.md) for the roadmap and progress.

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
| `docs/` | Plan, reverse-engineering notes, file formats |

## Playing the original in DOSBox-X (with soundtrack)
```sh
# once: rebuild the CD image with real audio tracks (~330 MB)
python3 tools/build_cd_image.py original_source/Image/DPImage.iso original_source/Image/fixed
# play
cd original_source/Game && dosbox-x -conf ../dplanet-cd.conf
```
The image has 8 audio tracks (2–9). The intro plays track 4, and the ending plays track 9. See `docs/re-notes.md`.

## Extracting assets
```sh
uv run --with numpy --with pillow python tools/extract_assets.py original_source /tmp/dp-assets
```
This produces SFX WAVs, the full-screen pictures as PNG, and the soundtrack tracks.

## Docs
- [docs/PLAN.md](docs/PLAN.md): goals, architecture, phases, open questions
- [docs/re-notes.md](docs/re-notes.md): reverse-engineering findings ledger
- [docs/file-formats.md](docs/file-formats.md): original file formats
