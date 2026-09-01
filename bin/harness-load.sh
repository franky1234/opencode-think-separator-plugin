#!/usr/bin/env bash
# bin/harness-load.sh — dev launcher for opencode-think-separator-plugin
#
# Launches opencode with the project harness. The harness consists of:
#   - .opencode/agent/*.md    → orchestrator, dev, qa, architect, code-reviewer
#   - .opencode/nah/policy.yaml + .opencode/plugins/nah-policy.js → local policy
#   - .opencode/agent/orchestrator.md → hand-written, recovery protocol
#   - superpowers plugin        → declarado en opencode.json del proyecto
#
# opencode auto-detecta .opencode/ cuando se ejecuta dentro del proyecto,
# así que este script solo necesita cambiar al directorio correcto.
#
# Usage:
#   ./bin/harness-load.sh                  # TUI normal
#   ./bin/harness-load.sh "fix this bug"   # one-shot via opencode run
#
# Optional env vars:
#   NAH_UNATTENDED=1    → resolves "ask" actions as deny (autonomous mode)

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"

if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
  echo "[harness-load.sh] Loaded .env ($ENV_FILE)"
fi

cd "$PROJECT_ROOT"

echo "[harness-load.sh] Project root: $PROJECT_ROOT"
echo "[harness-load.sh] Harness: .opencode/ + .harness/ (engram global, superpowers local)"

if [ "$#" -eq 0 ]; then
  exec opencode --prompt "/resume"
else
  exec opencode "$@"
fi