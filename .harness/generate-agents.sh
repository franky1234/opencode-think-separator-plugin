#!/bin/bash
# .harness/generate-agents.sh — generates all specialized agents in .opencode/agent/
# resolving models via .harness/models.yaml (single source of truth).
#
# Generates:
#   - .opencode/agent/dev-<domain>.md (for each domain in domains.yaml)
#   - .opencode/agent/architect.md
#   - .opencode/agent/qa.md
#   - .opencode/agent/code-reviewer.md
#
# Usage:
#   bash .harness/generate-agents.sh                # skip if files exist (safe)
#   bash .harness/generate-agents.sh --force         # overwrite (backs up by default)
#   bash .harness/generate-agents.sh --no-backup    # overwrite without backup
#   bash .harness/generate-agents.sh --dry-run      # show what would be done
#   bash .harness/generate-agents.sh --help         # help message

set -euo pipefail
cd "$(dirname "$0")/.."

MODE="preserve"   # preserve | force | dry-run
BACKUP=true

for arg in "$@"; do
  case "$arg" in
    --force)         MODE="force" ;;
    --no-backup)     BACKUP=false ;;
    --dry-run)       MODE="dry-run" ;;
    -h|--help)
      sed -n '2,14p' "$0"
      exit 0
      ;;
    *) echo "Unknown flag: $arg" >&2; exit 1 ;;
  esac
done

MODELS_FILE=".harness/models.yaml"
DOMAINS_FILE=".harness/domains.yaml"

[ -f "$MODELS_FILE" ] || { echo "ERROR: $MODELS_FILE not found." >&2; exit 1; }
[ -f "$DOMAINS_FILE" ] || { echo "ERROR: $DOMAINS_FILE not found." >&2; exit 1; }

# Robust YAML query helper using python3 PyYAML
yaml_get_role() {
  local role="$1"
  python3 -c "
import yaml, sys
with open('$MODELS_FILE') as f:
    data = yaml.safe_load(f)
print(data.get('roles', {}).get('$role', ''))
"
}

yaml_get_domains() {
  python3 -c "
import yaml
with open('$DOMAINS_FILE') as f:
    data = yaml.safe_load(f)
for d in data.get('domains', []):
    print(f\"{d.get('name', '')}|{d.get('path', '.')}|{d.get('blast_radius', 'high')}\")
"
}

# Resolve a role to a model string. Precedence: ENV VAR -> models.yaml
resolve_role() {
  local role="$1"
  local env_key="HARNESS_MODEL_$(printf '%s' "$role" | tr '[:lower:]' '[:upper:]')"
  if [ -n "${!env_key:-}" ]; then
    echo "${!env_key}"
    return 0
  fi
  yaml_get_role "$role"
}

# Map blast_radius to role name
role_for_radius() {
  local r="$1"
  case "$r" in
    high)   echo "dev_coding" ;;
    medium) echo "dev_light" ;;
    low)    echo "dev_light" ;;
    *)      echo "WARN: unknown blast_radius '$r', falling back to dev_light" >&2
            echo "dev_light" ;;
  esac
}

skills_for_role() {
  local role="$1"
  case "$role" in
    dev_coding|dev_light)
      echo "test-driven-development, executing-plans, systematic-debugging, receiving-code-review, verification-before-completion, using-superpowers"
      ;;
    qa)
      echo "test-driven-development, systematic-debugging, verification-before-completion, using-superpowers"
      ;;
    code_reviewer)
      echo "verification-before-completion, systematic-debugging, using-superpowers"
      ;;
    architect)
      echo "brainstorming, writing-plans, using-superpowers"
      ;;
    primary)
      echo "brainstorming, writing-plans, subagent-driven-development, dispatching-parallel-agents, using-git-worktrees, finishing-a-development-branch, requesting-code-review, using-superpowers"
      ;;
    *)
      echo "using-superpowers"
      ;;
  esac
}

render_skill_block() {
  local skills_csv="$1"
  printf 'permission:\n  skill:\n'
  IFS=', ' read -ra SKILLS <<< "$skills_csv"
  for s in "${SKILLS[@]}"; do
    [ -n "$s" ] && printf '    %s: allow\n' "$s"
  done
  printf '    "*": deny\n'
}

mkdir -p .opencode/agent

write_agent_file() {
  local target="$1"
  local content="$2"
  local desc="$3"

  if [ -f "$target" ] && [ "$MODE" = "preserve" ]; then
    echo "[skip]    $target (already exists; use --force to overwrite)"
    return 0
  fi

  if [ "$MODE" = "dry-run" ]; then
    if [ -f "$target" ]; then
      echo "[dry-run] $target would be overwritten ($desc)"
    else
      echo "[dry-run] $target would be created ($desc)"
    fi
    return 0
  fi

  if [ -f "$target" ] && [ "$BACKUP" = true ]; then
    cp "$target" "${target}.bak"
    echo "[backup]  ${target}.bak"
  fi

  cat > "$target" <<< "$content"
  echo "[ok]      $target ($desc)"
}

TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# 1. Generate dev agents for each domain in domains.yaml
yaml_get_domains | while IFS='|' read -r NAME DOMAIN_PATH RADIUS; do
  [ -z "$NAME" ] && continue

  ROLE="$(role_for_radius "$RADIUS")"
  MODEL="$(resolve_role "$ROLE")"
  SKILLS_BLOCK="$(render_skill_block "$(skills_for_role "$ROLE")")"

  if [ "$DOMAIN_PATH" = "." ]; then
    SCOPE_TEXT="You work at the repo root (single domain)."
  else
    SCOPE_TEXT="You work in ${DOMAIN_PATH}."
  fi

  CONTENT="---
description: \"Developer ${NAME} — blast_radius: ${RADIUS}\"
mode: subagent
model: ${MODEL}
temperature: 0.1
tools: { write: true, edit: true, bash: true, read: true, grep: true, glob: true, task: false }
${SKILLS_BLOCK}
# permission.skill: gated per-role by .harness/generate-agents.sh
# nah permission: governed by .opencode/nah/policy.yaml
# generated: ${TS} by .harness/generate-agents.sh
# model source: .harness/models.yaml → roles.${ROLE}
---
${SCOPE_TEXT} Your declared blast_radius is ${RADIUS}.

## Discipline & Standards
- Follow Test-First (TDD) discipline: write/update unit tests before implementation.
- Keep functions small, single responsibility, strictly typed, with zero dead code.
- Run 'npm run check:fix' and 'npm test' before marking any task as complete.
- Consult memory (mem_search) for conventions already used in this domain. Upon completion, save key decisions (mem_save, scope: project).

## Feedback Consumption
When the orchestrator re-assigns a task with feedback from \`qa\` or \`code-reviewer\`:
- **BLOCKER** → fix immediately, re-deliver. No further action until resolved.
- **SUGGESTION** → apply if the fix is small (≤5 lines changed). Otherwise reply \`DEFER\` and the orchestrator will queue it.
- **NITPICK** → ignore.
- Max retries on the same BLOCKER: **3**. After that, return \`STUCK\` to the orchestrator and the user is escalated.

When fixing, address every BLOCKER explicitly. Re-run affected tests (npm test) before returning."

  write_agent_file ".opencode/agent/dev-${NAME}.md" "$CONTENT" "role: $ROLE → $MODEL"
done

# 2. Generate Architect agent
ARCHITECT_MODEL="$(resolve_role "architect")"
ARCHITECT_SKILLS="$(render_skill_block "$(skills_for_role "architect")")"
ARCHITECT_CONTENT="---
description: \"System Architect — Phase 0 Planning, Schema Design, Domain Boundaries & API Contracts\"
mode: subagent
model: ${ARCHITECT_MODEL}
temperature: 0.1
tools: { read: true, grep: true, glob: true, write: false, edit: false, bash: false, task: false }
${ARCHITECT_SKILLS}
# model source: .harness/models.yaml → roles.architect
---
You are the System Architect subagent. You design architecture, API contracts, and schema boundaries.

## Responsibilities:
1. Define domain boundaries and module isolation (especially in monorepo packages).
2. Author strict TypeScript interfaces, Zod schemas, and persistence contracts.
3. Conduct blast-radius risk analysis (low/medium/high) for proposed changes.
4. Deliver comprehensive Phase 0 master plans in docs/superpowers/plans/<plan>.md.
5. Save architectural decisions to Engram (mem_save, topic_key: <domain>-architecture)."

write_agent_file ".opencode/agent/architect.md" "$ARCHITECT_CONTENT" "role: architect → $ARCHITECT_MODEL"

# 3. Generate QA agent
QA_MODEL="$(resolve_role "qa")"
QA_SKILLS="$(render_skill_block "$(skills_for_role "qa")")"
QA_CONTENT="---
description: \"QA / Tester — Deterministic test suite validation and regression testing\"
mode: subagent
model: ${QA_MODEL}
temperature: 0.1
tools: { bash: true, read: true, grep: true, glob: true, write: false, edit: false, task: false }
${QA_SKILLS}
# model source: .harness/models.yaml → roles.qa
---
You are the QA subagent. Your job is deterministic verification without hallucination.

## Responsibilities:
1. Run test suite using 'npm test' or .harness/workers/deterministic-qa-worker.sh.
2. Verify all unit tests pass with exit code 0.
3. Ensure linter passes (npm run check).
4. Verify total passed test count meets or exceeds the previous baseline.

## Feedback Output Format:
Verdict: PASS | FAIL
Findings:
- [BLOCKER] test_failure: <test name>
  - Location: tests/<file>.test.ts:<line>
  - Issue: <exact failure message>
  - Fix: <suggested fix>"

write_agent_file ".opencode/agent/qa.md" "$QA_CONTENT" "role: qa → $QA_MODEL"

# 4. Generate Code Reviewer agent
REVIEWER_MODEL="$(resolve_role "code_reviewer")"
REVIEWER_SKILLS="$(render_skill_block "$(skills_for_role "code_reviewer")")"
REVIEWER_CONTENT="---
description: \"Code Reviewer — Audits code for correctness, OWASP security, and maintainability\"
mode: subagent
model: ${REVIEWER_MODEL}
temperature: 0.1
tools: { read: true, grep: true, glob: true, write: false, edit: false, bash: false, task: false }
${REVIEWER_SKILLS}
# model source: .harness/models.yaml → roles.code_reviewer
---
You are the Code Reviewer subagent. You are read-only — your role is strict quality auditing.

## Responsibilities:
1. Correctness: logic errors, edge cases, off-by-one, unhandled rejections.
2. Security: OWASP Top 10, input sanitization, path traversal, prototype pollution.
3. Code Hygiene: Single responsibility, strict typing (no any), Biome rules.

## Output Format:
Verdict: APPROVE | REQUEST_CHANGES
Findings:
- [SEVERITY] <category>: <one-line description>
  - Location: <file>:<line>
  - Issue: <what is wrong>
  - Fix: <suggested change>"

write_agent_file ".opencode/agent/code-reviewer.md" "$REVIEWER_CONTENT" "role: code_reviewer → $REVIEWER_MODEL"

echo ""
echo "Agent generation completed successfully."
