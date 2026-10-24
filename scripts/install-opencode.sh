#!/usr/bin/env bash
# Idempotent install/upgrade of the defdo-tps OpenCode TUI plugin on any machine.
#
#   git pull
#   scripts/install-opencode.sh
#
# Fixes the repo-rename + pre-restructure drift in one run: remote URL, symlink
# target (repo/opencode), stale defdo-tps dir, dependencies.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGINS_DIR="$HOME/.config/opencode/plugins"
SYMLINK="$PLUGINS_DIR/defdo-tps-sidebar"
STALE_DIR="$PLUGINS_DIR/defdo-tps"
CORRECT_URL="https://github.com/defdo-dev/defdo_tps.git"

cd "$REPO_ROOT"

# Repo was renamed defdo_opencode_tps -> defdo_tps; GitHub redirects but warns.
current_url="$(git remote get-url origin 2>/dev/null || true)"
case "$current_url" in
  *defdo_opencode_tps*)
    git remote set-url origin "$CORRECT_URL"
    echo "remote origin -> $CORRECT_URL"
    ;;
esac

# Stale pre-restructure plugin copy (real dir with V1 plugin.js), never a symlink.
if [ -d "$STALE_DIR" ] && [ ! -L "$STALE_DIR" ]; then
  rm -rf "$STALE_DIR"
  echo "removed stale $STALE_DIR"
fi

# OpenCode 2 loads directory plugins; the entry must resolve to opencode/.
mkdir -p "$PLUGINS_DIR"
target="$(readlink "$SYMLINK" 2>/dev/null || true)"
if [ "$target" != "$REPO_ROOT/opencode" ]; then
  ln -sfn "$REPO_ROOT/opencode" "$SYMLINK"
  echo "symlink $SYMLINK -> $REPO_ROOT/opencode"
fi

bun install --frozen-lockfile

# Loader-path smoke: the TUI resolves the module the same way.
(cd "$PLUGINS_DIR/defdo-tps-sidebar" && bun -e 'const m = await import("./tui.tsx"); if (typeof m.default.setup !== "function") process.exit(1); console.log("smoke OK:", m.default.id)')

echo "done — restart the TUI (exit + opencode) to load"
