# opencode-think-separator-plugin — Execution Plan

Opencode TUI plugin that visually separates the model's reasoning block (`<think>`, `reasoning`, `thoughts`, etc.) from its final response. Provider-agnostic (Anthropic, OpenAI, Google, MiniMax) and opencode-version-agnostic (≥ 1.15).

**Repo**: https://github.com/franky1234/opencode-think-separator-plugin
**Path**: `/home/franklin/Desktop/REPO/klassapp/think-separator-plugin/`
**Version**: `0.2.0`
**License**: MIT

---

## Scope & Goals

1. Standalone plugin for opencode TUI that detects reasoning blocks and renders them with a "Reasoning" header + separator.
2. Provider-agnostic — detection via field-name discovery and XML tag parsing, not hardcoded provider checks.
3. Opencode-version-agnostic ≥ 1.15 — using only documented and stable plugin APIs.
4. Public distribution via GitHub + npm.
5. Project-specific harness (orchestrator / dev / qa) to coordinate development.

---

## Non-Goals (out of scope for v0.2.0)

- Interactive collapsible rendering (header always visible in MVP)
- Runtime visual user configuration (fixed label "Reasoning" default, customizable via plugin config)
- Support for non-standard undocumented raw socket protocols
- Compatibility with opencode versions < 1.15
- Theme-specific coupling (render remains theme-agnostic via Markdown)

---

## Architecture Overview

```
src/
├── index.js              # Entry point, registers hooks and message transformer pipeline
├── detect-reasoning.js   # Strategy-based detector and 3-phase XML reasoning parser
├── render.js             # Markdown formatter (header + blockquote + separator)
└── config.js             # Configuration defaults and safe merger
```

### Detection (Agnostic Heuristic & XML Tag Parsing)

```js
const REASONING_FIELDS = [
    "thinking",
    "reasoning",
    "reasoning_content",
    "reasoning_text",
    "redacted_thinking",
    "thoughts",
    "cot",
    "chain_of_thought",
    "internal_monologue",
    "reflection"
]
```

Strategy:

1. Scan `message.parts` for native reasoning types (`reasoning`, `thinking`).
2. Scan text parts for embedded XML reasoning tags (`<think>`, `<thought>`, `<antThinking>`, `<reasoning>`, etc.).
3. Scan top-level `message.*` fields (OpenAI/Google style) as defense-in-depth.
4. Return first match with `reasoning`, `source` field name, and `kind`.
5. Return `null` if no match (control negative case).

### Render

- Markdown Header: `> ### ── Reasoning ──`
- Blockquote body: `> *line*` (italicized and indented inside blockquote)
- Visual trailing separator: double newline before final response
- Theme-agnostic: relies on native OpenCode Markdown theme engine

---

## Phases

### PHASE H — Harness ✅ COMPLETED (commit `ab115b2`)

Project bootstrap with complete agentic harness:

- AGENTS.md, .harness/{domains,models}.yaml, generate-agents.sh, add-skills.sh
- .opencode/agent/*.md (orchestrator hand-written + 4 generated)
- .opencode/nah/policy.yaml + .opencode/plugins/nah-policy.js (26 tests pass)
- opencode.json (superpowers plugin + engram MCP)
- bin/harness-load.sh (dev launcher)
- package.json v0.1.0
- Smoke test: add-skills ✓, nah-policy tests 26/26 ✓, opencode 1.18.18 detected ✓

### PHASE 0 — Deep Research & Discovery ✅ COMPLETED

**0.1 — Opencode Plugin API**
- Analyzed `packages/plugin/src/` and `~/.config/opencode/plugins/`
- Identified `experimental.chat.messages.transform` as the primary server hook
- Documented in `docs/PLUGIN_API.md`

**0.2 — Localization of `<think>` serialization**
- Verified streaming behavior and message transform lifecycle
- Documented in `docs/ARCHITECTURE.md`

**0.3 — Provider Fixtures Collection**
- Anthropic, OpenAI, Google, MiniMax synthetic fixtures
- Control negative fixture
- Output: 5 JSON files in `test/fixtures/`

**0.4 — Agnostic Heuristic Validation**
- Built `REASONING_FIELDS` and `REASONING_TAG_NAMES` whitelists
- Validated across all 5 test fixtures

**0.5 — Version Compatibility**
- Matrix documented in `docs/COMPATIBILITY.md`

### PHASE 1 — Contract & Design Architecture ✅ COMPLETED

- **1.1** Plugin interface and hook signatures → `docs/ARCHITECTURE.md` §1
- **1.2** Agnostic heuristic documentation → `docs/ARCHITECTURE.md` §2
- **1.3** Theme-agnostic Markdown render pipeline → `docs/ARCHITECTURE.md` §3
- **1.4** Configuration API (`label`, future options) → `docs/ARCHITECTURE.md` §4

### PHASE 2 — Implementation ✅ COMPLETED

- **2.1** `src/detect-reasoning.js` with Strategy Pattern + XML parser
- **2.2** `src/render.js` with Formatter Pattern (Markdown blockquote)
- **2.3** `src/config.js` with frozen defaults (`label: "Reasoning"`)
- **2.4** `src/index.js` with Pipeline Transformer Pattern
- **2.5** `bin/dev.sh` linking plugin and starting opencode
- **2.6** Unit test suite (27 passing tests)

### PHASE 3 — Cross-Provider Validation & Hardening ✅ COMPLETED

- **3.1** Full test suite passing (4 providers + control + XML tag fixtures)
- **3.2** Plugin loads cleanly in OpenCode without errors
- **3.3** Pure in-memory transformation (zero SQLite / DB contamination)
- **3.4** Updated `docs/COMPATIBILITY.md` and `docs/ARCHITECTURE.md`

### PHASE 4 — Public Distribution Preparation ✅ COMPLETED

- **4.1** Complete `README.md` (installation, how it works, configuration)
- **4.2** `LICENSE` (MIT) + `CONTRIBUTING.md`
- **4.3** GitHub repository published at `github.com/franky1234/opencode-think-separator-plugin`
- **4.4** Git branch main synchronized
- **4.5** `npm pack --dry-run` verified (8 essential files, 8.8 kB tarball)
- **4.6** `bin/install.sh` executable and idempotent

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Plugin API changed since opencode 1.15 | Verified `experimental.chat.messages.transform` stability |
| False positives in agnostic detection | Explicit whitelist + negative control fixture |
| Render formatting breaks in custom themes | Pure GFM Markdown blockquotes instead of hardcoded ANSI escapes |
| Public npm publish failure | Verified `npm pack --dry-run` and `prepublishOnly` script |
| Unclosed `<think>` tags during streaming | 3-phase regex parser recovers unclosed tags gracefully |
| `bin/dev.sh` fails if opencode is not in PATH | Documented prerequisite with clear fallback instructions |

---

## Tracking & Conventions

Each phase completes with:

- Dedicated conventional commit
- Progress update in documentation
- `mem_save` in Engram persistent memory

---

## Cross References

- [AGENTS.md](AGENTS.md) — project standards
- [.harness/domains.yaml](.harness/domains.yaml) — domain declaration
- [.harness/models.yaml](.harness/models.yaml) — model routing
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — architecture & render pipeline
- [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) — compatibility matrix
- [CONTRIBUTING.md](CONTRIBUTING.md) — contribution guidelines
- [README.md](README.md) — package overview & installation guide
