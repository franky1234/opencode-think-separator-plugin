#!/usr/bin/env bash
set -euo pipefail

if ! command -v opencode >/dev/null 2>&1; then
  echo "error: 'opencode' not found in PATH. Install opencode >= 1.15 first." >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_DIR="${OPENCODE_PLUGIN_DIR:-$HOME/.config/opencode/plugins}"
SERVER_LINK="$PLUGIN_DIR/think-separator-plugin.js"
TUI_JSON="${OPENCODE_TUI_CONFIG:-$HOME/.config/opencode/tui.json}"
TUI_SPEC="file://$REPO_ROOT/src/tui.jsx"

mkdir -p "$PLUGIN_DIR"

# Server-side plugin link — auto-discovered by `opencode server` via the
# {plugin,plugins}/*.{ts,js} glob.
ln -sf "$REPO_ROOT/src/index.js" "$SERVER_LINK"

# TUI-side plugin — opencode loads TUI plugins from tui.json's `plugin` array
# (there is no filesystem auto-discovery for TUI plugins, and the .tui.js
# suffix is not a load trigger). Register the .jsx entry via a file:// spec so
# Bun JSX-transforms it at import time.
node -e '
  const fs = require("node:fs");
  const file = process.argv[1];
  const spec = process.argv[2];
  const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  data.plugin = Array.isArray(data.plugin) ? data.plugin : [];
  if (!data.plugin.includes(spec)) data.plugin.push(spec);
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
' "$TUI_JSON" "$TUI_SPEC"

echo "linked:"
echo "  $SERVER_LINK -> $REPO_ROOT/src/index.js"
echo "  tui: $TUI_JSON -> $TUI_SPEC"
echo "starting opencode..."
exec opencode "$@"
