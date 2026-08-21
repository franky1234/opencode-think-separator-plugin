#!/usr/bin/env bash
# bin/install.sh — one-shot installer for opencode-think-separator-plugin.
#
# Adds the plugin to the user's opencode.json `plugin` array (server-side
# only; never touches tui.json). Run as:
#   npx opencode-think-separator-plugin-install
# or:
#   bash "$(npm root -g)/opencode-think-separator-plugin/bin/install.sh"
#
# Idempotent: re-running is a no-op once the entry exists.

set -euo pipefail

PLUGIN_NAME="opencode-think-separator-plugin"
CONFIG_DIR="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"
CONFIG_FILE="$CONFIG_DIR/opencode.json"
TS="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$CONFIG_DIR"

if [ -f "$CONFIG_FILE" ]; then
  cp "$CONFIG_FILE" "$CONFIG_FILE.bak.$TS"
  echo "backup: $CONFIG_FILE.bak.$TS"
fi

if command -v jq >/dev/null 2>&1; then
  if [ -f "$CONFIG_FILE" ]; then
    tmp="$(mktemp)"
    jq --arg p "$PLUGIN_NAME" '
      if (.plugin // [] | index($p)) then .
      else .plugin = ((.plugin // []) + [$p]) end
    ' "$CONFIG_FILE" > "$tmp" 2>/dev/null || cp "$CONFIG_FILE" "$tmp"
    mv "$tmp" "$CONFIG_FILE"
  else
    printf '{\n  "plugin": ["%s"]\n}\n' "$PLUGIN_NAME" > "$CONFIG_FILE"
  fi
else
  node -e '
    const fs = require("node:fs");
    const file = process.argv[1];
    const name = process.argv[3];
    const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
    const arr = Array.isArray(data.plugin) ? data.plugin : [];
    if (!arr.includes(name)) arr.push(name);
    data.plugin = arr;
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  ' "$CONFIG_FILE" _ "$PLUGIN_NAME"
fi

echo "installed: $PLUGIN_NAME -> $CONFIG_FILE"
echo "next: restart opencode to load the plugin"
