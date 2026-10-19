# CLAUDE.md

Remake of *Dark Planet* (1998 DOS shooter, Turbo Pascal 7 + AniVGA + SMIX) by
the user and two friends. **The original source is lost**: gameplay must be
reverse-engineered from `original_source/Game/DP.EXE`. Read `README.md` for
the overview and `docs/PLAN.md` for the current phase and next tasks.

## Keep these docs current
- `docs/PLAN.md`: tick off tasks, add new ones, and record decisions the user confirms.
- `docs/re-notes.md`: every RE finding, marked Observed / Inferred / Unknown, with addresses (and REA Evidence IDs when available).
- `docs/file-formats.md`: format specs, once decoded and verified.
Update them at the end of each piece of work, not only at session end.

## Ground rules
- `original_source/` is the pristine original. Never modify existing files there. Generated output goes in clearly named new subfolders (e.g. `Image/fixed/`) or outside the repo.
- Text files from the original are CP437 and German (`iconv -f cp437 -t utf-8`).
- Python tools in `tools/` use the stdlib, or `uv run --with numpy --with pillow` for numpy/PIL (no system numpy).
- Reverse-engineered behaviour must come from evidence (disassembly, DOSBox-X observation, prototype source), not guesses. Say clearly when something is inferred.

## Reverse-engineering setup (installed 2026-10-19)
- Ghidra 12.1.4: `~/opt/ghidra_12.1.4_PUBLIC`
- Temurin JDK 21 (full JDK; the system Java is a JRE only): `~/opt/jdk-21.0.12.1+1`
- **REA 6.7.0** (Reverse Engineer Anything, github.com/morluto/rea) is registered as the MCP server `rea` in `~/.claude.json`, with `GHIDRA_INSTALL_DIR` and `JAVA_HOME` set. Use the `reverse-engineer-anything` skill. **Prefer the MCP tools** (`open_binary`, `list_procedures`, `analyze_function`, `read_function_instructions`, `annotate_*`, …). DOS MZ files load as `x86:LE:16:Real Mode` at segment 0x1000, and addresses are linear.
- CLI fallback: `tools/rea.sh <command> <absolute-path> [args]` (commands: `inspect`, `search --kind procedures --mode regex '.*'`, `decompile <addr>`, `instructions <addr>`, `function <addr>`). Snapshots are cached in `.rea/`.
- DOSBox-X is installed (`dosbox-x`). Its built-in debugger is useful for dynamic analysis.

### Turbo Pascal 7 RE tips
- Segment order: main program first, then units, then the System RTL last (in STARTAUD.EXE that's segment 0x1162).
- String literals are length-prefixed and live in the code segment just before the procedure that uses them. **Ghidra's string search misses them**, so locate them by file offset: DP.EXE linear address = `0x10000 + file_offset − 8608` (MZ header size).
- Ghidra sometimes decompiles into garbage after far calls into the RTL (the `entry` of STARTAUD.EXE is an example). Fall back to `instructions`.
- Library sources (AniVGA 1.2, SMIX) and the prototype `original_source/CD/Wasndas/SLY/SLYVERS.PAS` help name routines.

## Key facts (details in docs/re-notes.md)
- Soundtrack: raw PCM in `Image/DPImage.iso` from byte 75274240 to EOF, split into 8 audio tracks (2–9) by `tools/build_cd_image.py` (verified, see re-notes).
- `STARTAUD.EXE` plays CD track number = **number of command-line arguments**.
- CD tracks: 2 menu, 3 story, 4 intro (DPMAX.BAT → STARTAUD), 5/6/7 levels (table DS:0x1032), 8 boss, 9 ending (`endvideo.bat` written by DP.EXE @0x1AC74). DP.EXE plays them through `CDPlay` @0x1DC48 and loops them with `CDRepeat` @0x1DC75.
- DP.EXE structure: main body (MZ entry) @0x1D769, game menu @0x1D095, game loop @0x1B787. Unit/segment map in re-notes "Program structure".
- Objdump works for quick whole-segment scans: `objdump -D -b binary -mi8086` on a segment sliced out of the file.
