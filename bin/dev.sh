#!/usr/bin/env bash
set -euo pipefail

if ! command -v opencode >/dev/null 2>&1; then
  echo "error: 'opencode' not found in PATH. Install opencode >= 1.15 first." >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_DIR="${OPENCODE_PLUGIN_DIR:-$HOME/.config/opencode/plugins}"
SERVER_LINK="$PLUGIN_DIR/think-separator-plugin.js"
TUI_LINK="$PLUGIN_DIR/think-separator-plugin.tui.js"

mkdir -p "$PLUGIN_DIR"

# Server-side plugin link — used by `opencode server` for messages.transform
ln -sf "$REPO_ROOT/src/index.js" "$SERVER_LINK"

# TUI-side plugin link — used by `opencode tui` for slot registration.
# opencode resolves `.tui.js` suffix as the TUI entry per packages/opencode/src/plugin/shared.ts.
ln -sf "$REPO_ROOT/src/tui.js" "$TUI_LINK"

echo "linked:"
echo "  $SERVER_LINK -> $REPO_ROOT/src/index.js"
echo "  $TUI_LINK    -> $REPO_ROOT/src/tui.js"
echo "starting opencode..."
exec opencode "$@"