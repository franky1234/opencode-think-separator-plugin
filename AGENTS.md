# opencode-think-separator-plugin — Project Standards

## Scope

Opencode TUI plugin that visually separates the model's reasoning block (`<think>`, `reasoning`, `thoughts`, etc.) from its final response. Plugin is rendered inside the opencode TUI as a styled block with header label and separator.

## Stack

- **Runtime**: Node.js (no TypeScript in MVP)
- **Tests**: `node --test` (built-in)
- **No runtime dependencies** — plugin loads as a plain `.js` file in `~/.config/opencode/plugins/`
- **Dev dependencies**: minimal (e.g. `js-yaml` for policy parsing if needed)

## Repo layout

- `src/` — plugin source
- `test/` — unit tests + fixtures from real provider responses
- `docs/` — ARCHITECTURE.md, COMPATIBILITY.md, PLUGIN_API.md
- `examples/` — opencode.json snippet for registering the plugin
- `.harness/` — domain config, agents generator, policies
- `.opencode/` — project-level opencode config + agent definitions
- `bin/harness-load.sh` — dev launcher

## Clean Code

- Short functions, single responsibility per function
- No dead code or comments that explain "what" instead of "why"
- Public API of each module documented in JSDoc

## Testing

- Every new feature/fix requires unit tests
- Run `npm test` before marking anything as complete
- Cross-provider fixtures required for any change touching `detect-reasoning.js`

## Memory (Engram)

- Engram is loaded globally by opencode (no per-project setup)
- Use `mem_save` proactively for: architectural decisions, plugin API discoveries, provider format findings, gotchas
- Do NOT save: every tool invocation, intermediate test output, transient state

## Domains

- Single domain: `opencode-think-separator-plugin`
- If a second domain emerges, edit `.harness/domains.yaml` and run `bash .harness/generate-agents.sh`

## Harness working files (do not touch)

- `.harness/sdd/` — orchestrator + superpowers working area, gitignored
- `.superpowers/` — orchestrator state, gitignored

## Model Selection

- Orchestrator + QA → `minimax/MiniMax-M3` (max effort, paid per token)
- Dev → `opencode-go/deepseek-v4-pro` (Go subscription, top coding/reasoning)
- If domain blast_radius changes, regenerate with `bash .harness/generate-agents.sh`

## Plugin-specific notes

- The plugin modifies TUI rendering — dev has high blast_radius
- Public plugin means downstream users trust stability: semantic versioning is mandatory
- `package.json` changes require QA + manual review before merge
- Backward compatibility: anything in `v0.x` may break; `v1.0.0` locks the contract

## Feedback Protocol

### Severity

- **BLOCKER** — must fix before merge (logic error, broken cross-provider, security hole, failing test)
- **SUGGESTION** — should fix, doesn't block
- **NITPICK** — optional polish

### Finding format

```
[SEVERITY] <category>: <one-line description>
- Location: <file>:<line>
- Issue: what's wrong
- Fix: suggested change
```

### Escalation

- BLOCKER → orchestrator re-dispatches to dev, retry until resolved
- 3 consecutive BLOCKERS → escalate to user
