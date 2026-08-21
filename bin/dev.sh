#!/usr/bin/env bash
set -euo pipefail

if ! command -v opencode >/dev/null 2>&1; then
  echo "error: 'opencode' not found in PATH. Install opencode >= 1.15 first." >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_DIR="${OPENCODE_PLUGIN_DIR:-$HOME/.config/opencode/plugins}"
SERVER_LINK="$PLUGIN_DIR/opencode-think-separator-plugin.js"

mkdir -p "$PLUGIN_DIR"

# Server-side plugin link — used by `opencode server` for messages.transform
ln -sf "$REPO_ROOT/src/index.js" "$SERVER_LINK"

echo "linked:"
echo "  $SERVER_LINK -> $REPO_ROOT/src/index.js"
echo "starting opencode..."
exec opencode "$@"
