# think-separator-plugin v0.1.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public opencode TUI plugin that visually separates the model's reasoning block from its final response, provider-agnostic across Anthropic, OpenAI, Google and MiniMax, opencode-version-agnostic >= 1.15.

**Architecture:** Single ESM `.js` file at `src/index.js` registers opencode plugin hooks. Detection layer (`src/detect-reasoning.js`) is a whitelist-based heuristic that scans `message.content[]` blocks (Anthropic/MiniMax style) and top-level `message.*` fields (OpenAI/Google style) for known reasoning-field names. Render layer (`src/render.js`) emits ANSI-styled output with a fixed `── Reasoning ──` header and separator. Defaults live in `src/config.js` (label `"Reasoning"`). No runtime dependencies.

**Tech Stack:** Node.js >=18 (ESM only, no TypeScript), `node --test` for unit tests, no dependencies, opencode plugin API >= 1.15, ANSI escapes for terminal styling.

**Spec:** `../PLAN.md` (root of repo) — original spec with phases, scope, non-goals, risks. This plan implements FASE 0 through FASE 4 of that spec.

---

## Global Constraints

- **Runtime**: Node.js, ESM (`"type": "module"` in `package.json`). No TypeScript.
- **No runtime dependencies.** Plugin ships as a plain `.js` file in `~/.config/opencode/plugins/`.
- **Tests**: `node --test` (built-in). Every task touching `detect-reasoning.js` requires cross-provider fixtures.
- **File layout** (locked): `src/index.js`, `src/detect-reasoning.js`, `src/render.js`, `src/config.js`; `test/detect-reasoning.test.js`, `test/render.test.js`, `test/config.test.js`, `test/fixtures/*.json` (5 fixtures + README); `docs/PLUGIN_API.md`, `docs/ARCHITECTURE.md`, `docs/COMPATIBILITY.md`; `examples/opencode.json`; `bin/dev.sh`; `README.md`; `LICENSE`; `CONTRIBUTING.md`.
- **Opencode plugin API floor**: >= 1.15. Current local version: 1.18.18.
- **Detection fields whitelist** (locked):
  ```js
  const REASONING_FIELDS = [
    'thinking', 'reasoning', 'reasoning_content', 'reasoning_text',
    'redacted_thinking', 'thoughts', 'cot', 'chain_of_thought',
    'internal_monologue', 'reflection'
  ];
  ```
- **Fixtures** (5): `anthropic-thinking.json`, `openai-reasoning.json`, `google-thoughts.json`, `minimax-thinking.json`, `no-reasoning-control.json`. All fixtures committed **synthetic** (constructed from public API docs, marked `synthetic-pending-validation`); real provider capture is a `DEFER` follow-up task before v1.0.0.
- **Render**: header `── Reasoning ──` (bold + underline), reasoning body dim + 2-space indented, blank-line separator, response body 2-space indented with no dim.
- **Backward compatibility**: v0.x may break; v1.0.0 locks the contract.
- **License**: MIT. Repo: `github.com/franky1234/think-separator-plugin`.

---

## File Structure Map

| Path | Role | Created in task |
|---|---|---|
| `src/config.js` | Defaults (label, future options) | Task 4 |
| `src/detect-reasoning.js` | Whitelist-based reasoning-field detector | Task 2 |
| `src/render.js` | ANSI-aware render of reasoning + response | Task 3 |
| `src/index.js` | opencode plugin entry, registers hooks | Task 6 |
| `bin/dev.sh` | Dev launcher: link plugin + start opencode | Task 7 |
| `test/detect-reasoning.test.js` | Unit tests for detector across 5 fixtures | Task 2 |
| `test/render.test.js` | Unit tests for render (header, separator, indent, dim) | Task 3 |
| `test/config.test.js` | Unit tests for config defaults + merge | Task 4 |
| `test/fixtures/anthropic-thinking.json` | Synthetic Anthropic `type:"thinking"` block response | Task 1 |
| `test/fixtures/openai-reasoning.json` | Synthetic OpenAI `reasoning_content` response | Task 1 |
| `test/fixtures/google-thoughts.json` | Synthetic Google `thoughts` field response | Task 1 |
| `test/fixtures/minimax-thinking.json` | Synthetic MiniMax `type:"thinking"` block response | Task 1 |
| `test/fixtures/no-reasoning-control.json` | Negative control: response without reasoning | Task 1 |
| `test/fixtures/README.md` | Flags each fixture as `synthetic-pending-validation` + replacement instructions | Task 1, updated Task 10 |
| `docs/PLUGIN_API.md` | Opencode plugin API research (hooks x versions) | Task 0 + Task 8 |
| `docs/ARCHITECTURE.md` | Plugin contract, heuristic, render, config API | Task 5 |
| `docs/COMPATIBILITY.md` | Matrix: opencode version x hook availability | Task 8 |
| `examples/opencode.json` | Snippet showing plugin registration | Task 6 |
| `README.md` | Install, usage, examples, screenshots | Task 9 |
| `LICENSE` | MIT license file | Task 9 |
| `CONTRIBUTING.md` | Dev workflow + fixture validation TODO | Task 10 |
| `.superpowers/sdd/think-separator-0.1.0/progress.md` | SDD ledger, updated per task | every task closure |

---

## Task 0: Opencode plugin API research

**Files:**
- Create: `docs/PLUGIN_API.md`

**Research inputs:**
- Read `https://opencode.ai/docs/plugins` (official docs).
- Read `~/.config/opencode/plugins/engram.ts` (or `.js`) as a real-world example of a hook-registration plugin.
- Grep `~/.cache/opencode/packages/opencode-ai/` for plugin-related symbols (`plugin`, `hook`, `register`).
- Run `opencode --version` to confirm baseline (expected: 1.18.18).

**Produces for the rest of the plan:**
- A confirmed `Plugin` export shape (function vs object, hook registration signature, hook names available in 1.18.18).
- A list of hook events the plugin will use.
- Opencode version baseline + a starting row in the compatibility matrix.

**Steps:**
- [ ] **Step 1:** Run `opencode --version` and capture output.
- [ ] **Step 2:** Fetch `https://opencode.ai/docs/plugins` and read in full.
- [ ] **Step 3:** Read `~/.config/opencode/plugins/engram.ts` (or `.js` if TS missing). Capture: how it exports, what hooks it listens to, hook callback signature.
- [ ] **Step 4:** Grep `~/.cache/opencode/packages/opencode-ai/` for `export.*function.*\(.*plugin` and `hook` to enumerate the API surface actually shipped in 1.18.18.
- [ ] **Step 5:** Write `docs/PLUGIN_API.md` with sections: §1 Plugin export shape (verified against engram + grep), §2 Available hooks in 1.18.18 (name -> callback signature -> when it fires), §3 Recommended hook for our use case (the hook where reasoning is still separable from final text), §4 Opencode versions surveyed (initial seed row), §5 Compatibility matrix seed.
- [ ] **Step 6:** Commit: `git add docs/PLUGIN_API.md && git commit -m "docs: PLUGIN_API.md with verified opencode 1.18.18 plugin API"`.

---

## Task 1: Synthetic cross-provider fixtures

**Files:**
- Create: `test/fixtures/anthropic-thinking.json`
- Create: `test/fixtures/openai-reasoning.json`
- Create: `test/fixtures/google-thoughts.json`
- Create: `test/fixtures/minimax-thinking.json`
- Create: `test/fixtures/no-reasoning-control.json`
- Create: `test/fixtures/README.md`

**Goal:** Lock the input shapes the detector must recognize. Each fixture is the full JSON shape that a provider would emit for one assistant message that includes reasoning. Fixtures are **synthetic** (constructed from public API docs), and each carries a top-level `_meta` block declaring `synthetic: true` and `validation: "pending"`.

**Shapes (locked — each fixture MUST match):**

`anthropic-thinking.json`:
```json
{
  "_meta": { "provider": "anthropic", "model": "claude-sonnet-4.5", "synthetic": true, "validation": "pending" },
  "role": "assistant",
  "content": [
    { "type": "thinking", "thinking": "The user wants X. I'll reason through Y." },
    { "type": "text", "text": "Here is the answer." }
  ]
}
```

`openai-reasoning.json`:
```json
{
  "_meta": { "provider": "openai", "model": "o3", "synthetic": true, "validation": "pending" },
  "role": "assistant",
  "content": null,
  "reasoning_content": "Step 1: consider X. Step 2: derive Y."
}
```

`google-thoughts.json`:
```json
{
  "_meta": { "provider": "google", "model": "gemini-2.5-pro", "synthetic": true, "validation": "pending" },
  "role": "model",
  "content": { "parts": [{ "text": "Final answer text." }] },
  "thoughts": "Internal chain of thought goes here."
}
```

`minimax-thinking.json`:
```json
{
  "_meta": { "provider": "minimax", "model": "MiniMax-M3", "synthetic": true, "validation": "pending" },
  "role": "assistant",
  "content": [
    { "type": "thinking", "thinking": "Internal reasoning trace." },
    { "type": "text", "text": "Visible response." }
  ]
}
```

`no-reasoning-control.json`:
```json
{
  "_meta": { "provider": "openai", "model": "gpt-4o", "synthetic": true, "validation": "pending" },
  "role": "assistant",
  "content": "Just a plain response, no reasoning."
}
```

**Steps:**
- [ ] **Step 1:** Verify `test/fixtures/` exists (it does — confirmed during session-start inspection).
- [ ] **Step 2:** Write `test/fixtures/anthropic-thinking.json` with the shape above.
- [ ] **Step 3:** Write `test/fixtures/openai-reasoning.json` with the shape above.
- [ ] **Step 4:** Write `test/fixtures/google-thoughts.json` with the shape above.
- [ ] **Step 5:** Write `test/fixtures/minimax-thinking.json` with the shape above.
- [ ] **Step 6:** Write `test/fixtures/no-reasoning-control.json` with the shape above.
- [ ] **Step 7:** Write `test/fixtures/README.md` explaining: each fixture is synthetic-pending-validation; how to replace with a real capture (curl against each provider's API with the reasoning-capable model); document the exact provider API doc URLs that informed each shape.
- [ ] **Step 8:** Validate JSON by parsing each file: `node -e "for (const f of ['anthropic-thinking','openai-reasoning','google-thoughts','minimax-thinking','no-reasoning-control']) JSON.parse(require('fs').readFileSync('test/fixtures/'+f+'.json','utf8'))"` — expect no output (silent success).
- [ ] **Step 9:** Commit: `git add test/fixtures/ && git commit -m "test: synthetic cross-provider reasoning fixtures (pending validation)"`.

---

## Task 2: Reasoning detector (`src/detect-reasoning.js`)

**Files:**
- Create: `src/detect-reasoning.js`
- Create: `test/detect-reasoning.test.js`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces:
  - `REASONING_FIELDS` (const, exported) — the whitelist from Global Constraints.
  - `detectReasoning(message)` -> `{ reasoning: string, source: string, kind: 'block' | 'field' } | null`
    - `kind: 'block'` when found inside `message.content[]` (Anthropic / MiniMax style).
    - `kind: 'field'` when found at top-level `message.<field>` (OpenAI / Google style).
    - `source` is the field name (e.g. `'thinking'`, `'reasoning_content'`, `'thoughts'`).
    - Returns `null` if no match (control fixture).

**TDD order — write the failing test first.**

**Steps:**
- [ ] **Step 1:** Write `test/detect-reasoning.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectReasoning, REASONING_FIELDS } from '../src/detect-reasoning.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8'));

test('REASONING_FIELDS includes all 10 whitelisted field names', () => {
  for (const f of ['thinking','reasoning','reasoning_content','reasoning_text','redacted_thinking','thoughts','cot','chain_of_thought','internal_monologue','reflection']) {
    assert.ok(REASONING_FIELDS.includes(f), `missing ${f}`);
  }
});

test('detectReasoning finds Anthropic thinking block in content[]', () => {
  const msg = fixture('anthropic-thinking.json');
  const r = detectReasoning(msg);
  assert.ok(r, 'should detect');
  assert.equal(r.source, 'thinking');
  assert.equal(r.kind, 'block');
  assert.match(r.reasoning, /user wants X/);
});

test('detectReasoning finds OpenAI reasoning_content top-level field', () => {
  const msg = fixture('openai-reasoning.json');
  const r = detectReasoning(msg);
  assert.ok(r);
  assert.equal(r.source, 'reasoning_content');
  assert.equal(r.kind, 'field');
});

test('detectReasoning finds Google thoughts top-level field', () => {
  const msg = fixture('google-thoughts.json');
  const r = detectReasoning(msg);
  assert.ok(r);
  assert.equal(r.source, 'thoughts');
  assert.equal(r.kind, 'field');
});

test('detectReasoning finds MiniMax thinking block in content[]', () => {
  const msg = fixture('minimax-thinking.json');
  const r = detectReasoning(msg);
  assert.ok(r);
  assert.equal(r.source, 'thinking');
  assert.equal(r.kind, 'block');
});

test('detectReasoning returns null for control fixture (no reasoning)', () => {
  const msg = fixture('no-reasoning-control.json');
  assert.equal(detectReasoning(msg), null);
});
```

- [ ] **Step 2:** Run `npm test` and confirm the test file fails to import (expected: `Cannot find module '../src/detect-reasoning.js'`).
- [ ] **Step 3:** Write `src/detect-reasoning.js`:

```js
/**
 * Provider-agnostic reasoning-block detector.
 *
 * Strategy:
 *   1. Scan message.content[] for blocks whose `type` is in REASONING_FIELDS
 *      (Anthropic / MiniMax style: { type: "thinking", thinking: "..." }).
 *   2. Scan top-level message.<field> for fields in REASONING_FIELDS
 *      (OpenAI / Google style: message.reasoning_content = "...").
 *
 * Whitelist is exhaustive — no guessing, no substring matching. Adding a new
 * provider means adding its field name to REASONING_FIELDS, not editing logic.
 */

export const REASONING_FIELDS = Object.freeze([
  'thinking',
  'reasoning',
  'reasoning_content',
  'reasoning_text',
  'redacted_thinking',
  'thoughts',
  'cot',
  'chain_of_thought',
  'internal_monologue',
  'reflection'
]);

const REASONING_SET = new Set(REASONING_FIELDS);

export function detectReasoning(message) {
  if (!message || typeof message !== 'object') return null;

  if (Array.isArray(message.content)) {
    for (const block of message.content) {
      if (block && typeof block === 'object' && REASONING_SET.has(block.type)) {
        const text = block[block.type];
        if (typeof text === 'string' && text.length > 0) {
          return { reasoning: text, source: block.type, kind: 'block' };
        }
      }
    }
  }

  for (const field of REASONING_FIELDS) {
    if (field in message && typeof message[field] === 'string' && message[field].length > 0) {
      return { reasoning: message[field], source: field, kind: 'field' };
    }
  }

  return null;
}
```

- [ ] **Step 4:** Run `npm test`. Expected: 6 tests pass, 0 fail.
- [ ] **Step 5:** Commit: `git add src/detect-reasoning.js test/detect-reasoning.test.js && git commit -m "feat: detect-reasoning with 5-fixture coverage (synthetic)"`.

---

## Task 3: Render layer (`src/render.js`)

**Files:**
- Create: `src/render.js`
- Create: `test/render.test.js`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces:
  - `renderReasoning(reasoningText, label)` -> `string` — emits header line, dim+indented body, trailing blank line.
  - `renderResponse(responseText)` -> `string` — emits the response text 2-space indented (no dim, no header).
  - `compose(detection, responseText, label)` -> `string` — full block: `renderReasoning(...) + renderResponse(...)`.

**ANSI conventions (locked):**
- Header style: bold + underline (`BOLD + UNDERLINE + "── <label> ──" + RESET`).
- Reasoning body: `DIM` ... `RESET`, 2-space indent per line.
- Separator between reasoning and response: trailing blank line on the reasoning block.
- Response body: no dim, no header — pass-through with 2-space indent per line.

**Steps:**
- [ ] **Step 1:** Write `test/render.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderReasoning, renderResponse, compose } from '../src/render.js';

const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const UNDERLINE = '\x1b[4m';

test('renderReasoning emits header with label and dim body', () => {
  const out = renderReasoning('hello world', 'Reasoning');
  assert.match(out, new RegExp(`${BOLD}${UNDERLINE}── Reasoning ──${RESET}`));
  assert.match(out, /hello world/);
  assert.ok(out.includes(DIM), 'body should be dim');
  assert.ok(out.includes(RESET), 'body should reset');
  assert.match(out, /\n\n$/, 'ends with blank-line separator');
});

test('renderReasoning respects custom label', () => {
  const out = renderReasoning('x', 'My Label');
  assert.match(out, /── My Label ──/);
});

test('renderResponse emits 2-space indented text, no header, no dim', () => {
  const out = renderResponse('the answer');
  assert.ok(!out.includes('──'), 'no header');
  assert.ok(!out.includes(DIM), 'no dim');
  assert.match(out, /^  the answer/);
});

test('compose combines reasoning block and response block', () => {
  const detection = { reasoning: 'thinking hard', source: 'thinking', kind: 'block' };
  const out = compose(detection, 'final answer');
  assert.ok(out.includes('thinking hard'));
  assert.ok(out.includes('final answer'));
  assert.ok(out.indexOf('thinking hard') < out.indexOf('final answer'));
});
```

- [ ] **Step 2:** Run `npm test` and confirm the new file fails to import.
- [ ] **Step 3:** Write `src/render.js`:

```js
/**
 * ANSI-aware render of reasoning + response blocks.
 *
 * Header: bold + underline (high contrast against body).
 * Reasoning body: dim (visually demoted vs response).
 * Response body: pass-through with 2-space indent (matches reasoning indent).
 *
 * Uses standard ANSI escapes — works on any modern terminal, theme-agnostic.
 */

const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const UNDERLINE = '\x1b[4m';

export function renderReasoning(reasoningText, label) {
  const safeLabel = typeof label === 'string' && label.length > 0 ? label : 'Reasoning';
  const header = `${BOLD}${UNDERLINE}── ${safeLabel} ──${RESET}`;
  const body = reasoningText
    .split('\n')
    .map((line) => `  ${DIM}${line}${RESET}`)
    .join('\n');
  return `${header}\n${body}\n\n`;
}

export function renderResponse(responseText) {
  return responseText
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
}

export function compose(detection, responseText, label) {
  return renderReasoning(detection.reasoning, label) + renderResponse(responseText);
}
```

- [ ] **Step 4:** Run `npm test`. Expected: 10 tests pass (6 detect + 4 render), 0 fail.
- [ ] **Step 5:** Commit: `git add src/render.js test/render.test.js && git commit -m "feat: render layer with ANSI header, dim body, separator"`.

---

## Task 4: Config defaults (`src/config.js`)

**Files:**
- Create: `src/config.js`
- Create: `test/config.test.js`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces:
  - `defaultConfig` (const) — `{ label: 'Reasoning' }`.
  - `mergeConfig(userConfig)` — returns merged config, with unknown keys ignored (forward-compat).

**Steps:**
- [ ] **Step 1:** Write `test/config.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultConfig, mergeConfig } from '../src/config.js';

test('defaultConfig.label is "Reasoning"', () => {
  assert.equal(defaultConfig.label, 'Reasoning');
});

test('mergeConfig returns defaults when given empty input', () => {
  assert.deepEqual(mergeConfig({}), defaultConfig);
});

test('mergeConfig overrides label when provided', () => {
  const out = mergeConfig({ label: 'Thinking' });
  assert.equal(out.label, 'Thinking');
});

test('mergeConfig ignores unknown keys (forward-compat)', () => {
  const out = mergeConfig({ label: 'X', futureOption: 42 });
  assert.equal(out.label, 'X');
  assert.equal(Object.prototype.hasOwnProperty.call(out, 'futureOption'), false);
});
```

- [ ] **Step 2:** Run `npm test` — confirm the new test file fails to import.
- [ ] **Step 3:** Write `src/config.js`:

```js
/**
 * Plugin configuration defaults and safe merge.
 *
 * Single config knob in v0.1.0: `label` (header text). Future versions may
 * add theme/style options — mergeConfig ignores unknown keys so older configs
 * keep working.
 */

export const defaultConfig = Object.freeze({
  label: 'Reasoning'
});

export function mergeConfig(userConfig) {
  const out = { ...defaultConfig };
  if (userConfig && typeof userConfig === 'object') {
    if (typeof userConfig.label === 'string' && userConfig.label.length > 0) {
      out.label = userConfig.label;
    }
  }
  return out;
}
```

- [ ] **Step 4:** Run `npm test`. Expected: 14 tests pass (6 detect + 4 render + 4 config), 0 fail.
- [ ] **Step 5:** Commit: `git add src/config.js test/config.test.js && git commit -m "feat: config defaults + safe merge for forward compat"`.

---

## Task 5: Architecture doc

**Files:**
- Create: `docs/ARCHITECTURE.md`

**Steps:**
- [ ] **Step 1:** Write `docs/ARCHITECTURE.md` with sections:
  - §1 Plugin contract: `name`, `hooks`, hook callback signatures (sourced from Task 0's `docs/PLUGIN_API.md`).
  - §2 Detection heuristic: copy the `REASONING_FIELDS` whitelist; include the field-to-provider table:

    | Field                | Provider(s)                  | Fixture                    | Detected |
    |----------------------|------------------------------|----------------------------|----------|
    | thinking (block)     | Anthropic, MiniMax           | anthropic-thinking.json    | yes      |
    | reasoning_content    | OpenAI                       | openai-reasoning.json      | yes      |
    | thoughts             | Google                       | google-thoughts.json       | yes      |
    | thinking (block)     | MiniMax                      | minimax-thinking.json      | yes      |
    | (none)               | control                      | no-reasoning-control.json  | null     |

  - §3 Render pipeline: ANSI conventions (header bold+underline, body dim, 2-space indent), sequence of `detectReasoning -> renderReasoning -> renderResponse`.
  - §4 Config API: signature `mergeConfig(userConfig)`, list of known keys, forward-compat behavior.
  - §5 Synthetic fixture disclaimer: every fixture carries `_meta.synthetic = true, validation: "pending"`; replacing with real captures is a `DEFER` follow-up before v1.0.0.
- [ ] **Step 2:** Commit: `git add docs/ARCHITECTURE.md && git commit -m "docs: ARCHITECTURE.md with contract, heuristic, render, config"`.

---

## Task 6: Plugin entry (`src/index.js`)

**Files:**
- Create: `src/index.js`
- Create: `examples/opencode.json`

**Depends on:** Tasks 0 (API surface), 2 (detect), 3 (render), 4 (config).

**Goal:** Wire the modules into a real opencode plugin export, following the exact API shape documented in Task 0.

**Steps:**
- [ ] **Step 1:** Re-read `docs/PLUGIN_API.md` §1 (plugin export shape) and §2 (available hooks). Confirm the exact export form and the hook name(s) we will register against.
- [ ] **Step 2:** Write `src/index.js`. Structure (the exact export form follows Task 0's finding — the snippet below is the canonical shape; adjust the hook name and callback signature to match whatever Task 0 confirmed):

```js
/**
 * think-separator-plugin — opencode TUI plugin entry.
 *
 * Detects reasoning blocks in assistant messages and renders them with a
 * visual separator above the final response.
 */

import { detectReasoning } from './detect-reasoning.js';
import { compose, renderResponse } from './render.js';
import { defaultConfig, mergeConfig } from './config.js';

export const ThinkSeparator = async ({ project, client, $, directory, worktree }) => {
  const config = mergeConfig({});
  return {
    label: 'think-separator',
    description: 'Visually separates model reasoning from final response',

    async onMessageRender(message, output) {
      if (!message || message.role !== 'assistant') return;
      const detection = detectReasoning(message);
      if (!detection) return;

      const responseText = extractResponseText(message);
      const reasoning = compose(detection, responseText, config.label);

      output.replace(reasoning);
    }
  };
};

function extractResponseText(message) {
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .filter((b) => b && typeof b === 'object' && b.type === 'text')
      .map((b) => b.text)
      .join('\n');
  }
  if (message.content && typeof message.content === 'object' && Array.isArray(message.content.parts)) {
    return message.content.parts.map((p) => (p && p.text) || '').join('\n');
  }
  return '';
}
```

- [ ] **Step 3:** Write `examples/opencode.json`:

```json
{
  "plugin": [
    "think-separator-plugin"
  ]
}
```

- [ ] **Step 4:** Validate by `node --check src/index.js` (syntax check, no runtime).
- [ ] **Step 5:** Commit: `git add src/index.js examples/opencode.json && git commit -m "feat: plugin entry wires detect + render + config"`.

---

## Task 7: Dev launcher (`bin/dev.sh`)

**Files:**
- Create: `bin/dev.sh`

**Goal:** A script that symlinks the plugin into the user's `~/.config/opencode/plugins/` (or `OPENCODE_PLUGIN_DIR` if set) and launches opencode. Must fail with a clear message if opencode is not in PATH.

**Steps:**
- [ ] **Step 1:** Write `bin/dev.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

if ! command -v opencode >/dev/null 2>&1; then
  echo "error: 'opencode' not found in PATH. Install opencode >= 1.15 first." >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_DIR="${OPENCODE_PLUGIN_DIR:-$HOME/.config/opencode/plugins}"
LINK_PATH="$PLUGIN_DIR/think-separator-plugin.js"

mkdir -p "$PLUGIN_DIR"
ln -sf "$REPO_ROOT/src/index.js" "$LINK_PATH"

echo "linked: $LINK_PATH -> $REPO_ROOT/src/index.js"
echo "starting opencode..."
exec opencode "$@"
```

- [ ] **Step 2:** `chmod +x bin/dev.sh`.
- [ ] **Step 3:** Run `bash -n bin/dev.sh` (syntax check).
- [ ] **Step 4:** Commit: `git add bin/dev.sh && git commit -m "feat: dev launcher links plugin into opencode plugins dir"`.

---

## Task 8: Cross-version compatibility check

**Files:**
- Create: `docs/COMPATIBILITY.md`
- Modify: `docs/PLUGIN_API.md` §4 (append compatibility table)

**Steps:**
- [ ] **Step 1:** Write `docs/COMPATIBILITY.md` with the opencode versions surveyed (>= 1.15 baseline: 1.15, 1.16, 1.17, 1.18) and the per-version hook availability matrix. Use the data gathered in Task 0.
- [ ] **Step 2:** If only one opencode version is locally available (1.18.18), document the matrix as "verified against 1.18.18 only; older versions not yet exercised" and list the next 3 versions to test in priority order.
- [ ] **Step 3:** Append the compatibility matrix to `docs/PLUGIN_API.md` §4.
- [ ] **Step 4:** Commit: `git add docs/COMPATIBILITY.md docs/PLUGIN_API.md && git commit -m "docs: COMPATIBILITY.md matrix + PLUGIN_API.md cross-version note"`.

---

## Task 9: README + LICENSE

**Files:**
- Create: `README.md`
- Create: `LICENSE`

**Steps:**
- [ ] **Step 1:** Write `LICENSE` as a standard MIT license text. Copyright year: 2026. Copyright holder: ask the user before committing if not obvious from `package.json`.
- [ ] **Step 2:** Write `README.md` with sections:
  - Title + one-line description.
  - Install: `npm install -g think-separator-plugin` (works once published; for now document the dev path `bin/dev.sh`).
  - Register: add to `~/.config/opencode/opencode.json` under `plugin`.
  - How it works: link to `docs/ARCHITECTURE.md`.
  - Compatibility: link to `docs/COMPATIBILITY.md`.
  - Contributing: link to `CONTRIBUTING.md`.
  - License: MIT.
- [ ] **Step 3:** Commit: `git add README.md LICENSE && git commit -m "docs: README + MIT LICENSE for v0.1.0"`.

---

## Task 10: Contributing + fixtures validation TODO

**Files:**
- Create: `CONTRIBUTING.md`
- Modify: `test/fixtures/README.md` (add TODO section if not already there)

**Steps:**
- [ ] **Step 1:** Write `CONTRIBUTING.md` with: how to run tests locally (`npm test`), PR process (open an issue first), the synthetic-fixtures disclaimer (validation by real provider capture is a pre-v1.0.0 requirement), and code style (no comments unless they explain "why", JSDoc on public APIs, ESM only).
- [ ] **Step 2:** Verify `test/fixtures/README.md` already has the validation TODO; if not, append a section "Replacing synthetic fixtures with real captures" listing the curl invocations to capture each provider's response.
- [ ] **Step 3:** Commit: `git add CONTRIBUTING.md test/fixtures/README.md && git commit -m "docs: CONTRIBUTING.md + fixtures validation guidance"`.

---

## Task 11: Final validation + tag

**Files:** none (verification-only task).

**Steps:**
- [ ] **Step 1:** Run `npm test` and confirm 14 tests pass (6 detect + 4 render + 4 config), 0 fail.
- [ ] **Step 2:** Run `bash -n bin/dev.sh && node --check src/index.js` — both succeed silently.
- [ ] **Step 3:** Verify `git status` is clean.
- [ ] **Step 4:** Verify all 5 fixtures parse as JSON and have `_meta.synthetic: true`:
  ```bash
  for f in test/fixtures/*.json; do node -e "const m = JSON.parse(require('fs').readFileSync('$f','utf8')); console.log('$f', m._meta && m._meta.synthetic === true ? 'OK' : 'MISSING META')"; done
  ```
  Expected: every fixture prints `OK`.
- [ ] **Step 5:** Tag the release: `git tag -a v0.1.0 -m "think-separator-plugin v0.1.0 MVP"`.
- [ ] **Step 6:** Save plan-completion memory to Engram with `topic_key: think-separator-plan-complete` summarizing commits, test count, deferred items (real fixture capture, multi-version matrix expansion).

---

## Self-Review (per writing-plans skill)

**1. Spec coverage:**
- Spec FASE 0.1 -> Task 0 (PLUGIN_API.md).
- Spec FASE 0.2 -> Task 0 (PLUGIN_API.md §3 covers where reasoning can be intercepted).
- Spec FASE 0.3 -> Task 1 (5 fixtures + README).
- Spec FASE 0.4 -> Tasks 2 + 5 (whitelist + table in ARCHITECTURE.md).
- Spec FASE 0.5 -> Task 8 (COMPATIBILITY.md).
- Spec FASE 1.1 -> Task 5 §1 (plugin contract in ARCHITECTURE.md).
- Spec FASE 1.2 -> Task 5 §2 (heuristic in ARCHITECTURE.md).
- Spec FASE 1.3 -> Task 5 §3 (render in ARCHITECTURE.md).
- Spec FASE 1.4 -> Task 5 §4 (config API in ARCHITECTURE.md).
- Spec FASE 2.1 -> Task 2.
- Spec FASE 2.2 -> Task 3.
- Spec FASE 2.3 -> Task 4.
- Spec FASE 2.4 -> Task 6.
- Spec FASE 2.5 -> Task 7.
- Spec FASE 2.6 -> Task 9 (README).
- Spec FASE 3.1 -> Task 11 (test count).
- Spec FASE 3.2, 3.3, 3.4 -> manual smoke (post-v0.1.0 tag; covered in CONTRIBUTING.md).
- Spec FASE 3.5 -> Task 8 + follow-up DEFER.
- Spec FASE 3.6 -> Task 8.
- Spec FASE 4.1 -> Task 9.
- Spec FASE 4.2 -> Tasks 9 (LICENSE) + 10 (CONTRIBUTING.md).
- Spec FASE 4.3, 4.4 -> manual (post-v0.1.0 tag).
- Spec FASE 4.5, 4.6 -> manual (post-v0.1.0 tag, requires npm login).

All spec items either covered by a task or explicitly marked manual/post-tag.

**2. Placeholder scan:** No "TBD", "TODO implement later", "fill in details", "add appropriate error handling", or "similar to Task N" present. Every step contains concrete commands or full code blocks.

**3. Type consistency:** `detectReasoning` returns `{ reasoning, source, kind: 'block' | 'field' }` consistently across Task 2 tests, Task 3 `compose()` signature, Task 6 `index.js` call. `renderReasoning(reasoningText, label)` signature matches between Task 3 and Task 6. `mergeConfig(userConfig)` signature matches between Task 4 and Task 6.

**4. Risks called out in original spec re-checked:**
- "Plugin API changed since 1.15" -> Task 0 investigates; Task 8 documents matrix.
- "False positives in detection" -> Whitelist explicit (Task 2) + control fixture (Task 1).
- "Render looks bad in some themes" -> Standard ANSI escapes (Task 3).
- "npm publish fails" -> Manual step, requires user npm login before FASE 4.
- "Bin/dev.sh breaks if opencode not in PATH" -> Task 7 checks PATH upfront with clear error.