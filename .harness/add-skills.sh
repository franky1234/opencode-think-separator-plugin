#!/bin/bash
# .harness/add-skills.sh — OPTIONAL. Run manually to verify skills wiring.
#
# This script does NOT install anything. Superpowers is loaded as an npm plugin
# declared in opencode.json:
#   "plugin": ["superpowers@git+https://github.com/obra/superpowers.git"]
#
# Skill restrictions are set per-agent via `permission.skill` in each
# .opencode/agent/*.md frontmatter (allow-listed skills + "*": deny).
# See generate-agents.sh for the agent scaffolding; this script only validates.
set -euo pipefail

cd "$(dirname "$0")/.."

PLUGIN_LINE='superpowers@git+https://github.com/obra/superpowers.git'

echo "verify: superpowers plugin declared in opencode.json"
if grep -q "$PLUGIN_LINE" opencode.json; then
  echo "  [ok] plugin declared"
else
  echo "  [err] plugin missing in opencode.json"
  exit 1
fi

echo ""
echo "verify: permission.skill present in each agent frontmatter"
for f in .opencode/agent/*.md; do
  if grep -q 'permission:' "$f" && grep -A6 'permission:' "$f" | grep -q 'skill:'; then
    echo "  [ok] $f"
  else
    echo "  [warn] $f has no permission.skill block"
  fi
done

echo ""
echo "Skills available (bundled with superpowers):"
if [ -d ~/.cache/opencode/packages/superpowers@git+https:/github.com/obra/superpowers.git/node_modules/superpowers/skills ]; then
  ls ~/.cache/opencode/packages/superpowers@git+https:/github.com/obra/superpowers.git/node_modules/superpowers/skills/ \
    | sed 's/^/  - /'
else
  echo "  (not yet downloaded — run opencode once to fetch the plugin)"
fi

echo ""
echo "No further action required. Skills are gated per-agent via permission.skill."