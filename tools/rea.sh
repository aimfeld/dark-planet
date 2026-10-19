#!/bin/sh
# Run a REA CLI command against a binary with the local Ghidra/JDK, caching the
# analysis snapshot per target in .rea/ (safe to delete; it is regenerated).
# Usage: tools/rea.sh <command> <absolute-target-path> [args...]
#   e.g. tools/rea.sh decompile "$PWD/original_source/Game/DP.EXE" 0x1ac44
# Prefer the REA MCP tools when they are connected; this is the CLI fallback.
export JAVA_HOME="$HOME/opt/jdk-21.0.12.1+1" GHIDRA_INSTALL_DIR="$HOME/opt/ghidra_12.1.4_PUBLIC"
cmd=$1; target=$2; shift 2
snapdir="$(cd "$(dirname "$0")/.." && pwd)/.rea"
mkdir -p "$snapdir"
cd "$HOME" && exec npx -y rea-agents@6.7.0 "$cmd" "$target" "$@" \
  --snapshot "$snapdir/$(basename "$target").snapshot" --provider ghidra --format json 2>/dev/null
