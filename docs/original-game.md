# The original game

The 1998 game is committed in `original_source/` (about 75 MB; `Game/` and `CD/` share their files), so a clone
plays it in DOSBox-X. Never modify the files there; generated output goes into new subfolders or outside the repo.

| Path | Contents |
|---|---|
| `original_source/Game/` | The installed original game (DP.EXE, assets, videos; the CD's `DPlanet/` and `Video/` plus SAVE.DAT and SETTINGS.DAT) |
| `original_source/CD/` | Contents of the original CD (its data track), incl. `Wasndas/` with two earlier games **with source**: `SLY/SLYVERS.PAS` (the Dark Planet prototype, 1997) and `CW2/CW2.PAS` (Cyberworms 2) |
| `original_source/Screenshots/` | Screenshots of the original |
| `original_source/dplanet.conf` | DOSBox-X config (see below) |
| `original_source/cdaudio/` | The CD for DOSBox-X: `dplanet.cue` = a placeholder data track + the soundtrack MP3s from `game/public/music/` |
| `original_source/save/` | Created by playing: what the game writes (settings, saves), a DOSBox-X overlay over `Game/` (not committed) |
| `original_source/Image/` | Local only: `DPImage.iso` (data track + all CD audio as one track); `fixed/` = the image rebuilt with proper audio tracks (`tools/build_cd_image.py`) |

## The disc image
Only the disc image `original_source/Image/DPImage.iso` (330 MB) is not committed. `tools/build_cd_image.py`,
`tools/export_music.py`, `tools/trailer.mjs` and `extract_assets.py`'s soundtrack need it. Download it from the
[`disc-image` release](https://github.com/aimfeld/dark-planet/releases/tag/disc-image) (77 MB) and unpack it:
```sh
xz -dc DPImage.iso.xz > original_source/Image/DPImage.iso
```

## Playing it in DOSBox-X (with soundtrack)
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
game loops them. See [re-notes.md](re-notes.md) "Soundtrack".

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
The formats are specified in [file-formats.md](file-formats.md). The remake's own assets come from
`npm run data` and friends (see [development.md](development.md)).
