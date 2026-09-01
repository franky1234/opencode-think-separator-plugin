# opencode-think-separator-plugin v0.1.0 — Distribution Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Date:** 2026-08-20
**Author:** System Architect subagent (FASE 2)
**Base commit:** v0.1.0 (a3994d9 on main)
**Target:** publish `opencode-think-separator-plugin@0.2.0` to npm public registry (minor bump for rename + npm distribution; server-side code unchanged)
**Spec:** This document IS FASE 2. FASE 0 research lives at `.superpowers/sdd/think-separator-0.1.0/progress.md` and `docs/ARCHITECTURE.md`. FASE 1 (the Approach A decision) was confirmed by user in-session.

---

## 1. Goal

Repackage the working `think-separator-plugin` (v0.1.0, server-side only, 19/19 tests green at HEAD `a3994d9`) as **`opencode-think-separator-plugin`** on the npm public registry so that any opencode user can install it via the `{ "plugin": [...] }` array in `~/.config/opencode/opencode.json`. The published v0.1.0 contains the unchanged server-side reasoning-separator core (`src/index.js` registering `experimental.chat.messages.transform`, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) §1) — no functional changes to plugin behavior. The TUI sidecar (staged but uncommitted work: `src/tui.jsx`, `src/sidebar.js`, `test/tui.test.js`, and the tui.json mutation added to `bin/dev.sh`) is dropped from this release and preserved on a separate branch (`feature/tui-sidecar-staging`) for a possible v0.3.0. The renaming matches the `opencode-*` package convention that the opencode ecosystem curated list at <https://opencode.ai/docs/ecosystem/> uses for inclusion.

## 2. Out of scope (explicit)

- **TUI sidecar implementation** — moved to v0.3.0 (see §7).
- **TypeScript migration** — stays plain JavaScript ESM (`"type": "module"` in `package.json:5`) to maintain zero runtime dependencies (`AGENTS.md:8-9`).
- **`npm publish` execution** — orchestrator confirms the dry-run output; user runs `npm publish` interactively with 2FA enabled. We do not bake any publish credentials or tokens into scripts.
- **Bun build step for the published artifact** — the plugin ships as plain ESM `.js` from `src/`. Opencode's runtime auto-installs npm packages at startup (<https://opencode.ai/docs/plugins/#how-plugins-are-installed>) and resolves the entry via `package.json` `main`. No pre-build is required.
- **Tagging a new git version** — we keep the existing `v0.1.0` tag because the server-side core is unchanged; the only thing changing is the npm package name and the published metadata.
- **Replacing synthetic fixtures with real provider captures** — still a DEFER follow-up before v1.0.0 (see [`test/fixtures/README.md`](test/fixtures/README.md) §"Validation TODO").
- **Renaming the GitHub repository slug** — flagged as open question (see §6).
- **Modifying `~/.config/opencode/tui.json`** — `bin/install.sh` is server-only by design (see §4 Task 5).

## 3. Approach (high-level)

1. **Clean the working tree** to v0.1.0 baseline (discard staged TUI sidecar work, restore `bin/dev.sh` to v0.1.0 content, delete `q.json`).
2. **Mechanically rename** every user-visible reference from `think-separator-plugin` → `opencode-think-separator-plugin` (package metadata, README, examples, plugin `id` field, internal JSDoc, docs references, `.harness/domains.yaml`).
3. **Add npm-publish metadata** to `package.json`: `bin`, `prepublishOnly` safety gate, expanded `keywords`, `files` whitelist.
4. **Add `.npmignore`** to exclude dev-only artifacts (`.harness/`, `.opencode/`, `.superpowers/`, `docs/`, `test/`, `examples/`, `bin/dev.sh`, `bin/harness-load.sh`, `.env`, `q.json`, `node_modules/`, `package-lock.json`, `opencode.json`).
5. **Add `bin/install.sh`** — one-shot installer that writes `"opencode-think-separator-plugin"` into the user's `opencode.json` `plugin` array (server-only; never touches `tui.json`).
6. **Rewrite README** install section to lead with the official `opencode.json` path; remove the obsolete `TUI sidebar indicator` limitation line from `README.md:84` (no longer part of v0.1.0).
7. **Validate with `npm publish --dry-run`** — verify tarball contains ONLY `[package.json, README.md, LICENSE, src/, bin/install.sh]` and nothing else; smoke-import the entry.

---

## 4. Tasks

### Task 1 — Working tree cleanup (restore v0.1.0 baseline)

**Files touched:**

- DELETE: `src/tui.jsx`
- DELETE: `src/sidebar.js`
- DELETE: `test/tui.test.js`
- DELETE: `q.json` (orphan file at repo root)
- RESTORE: `bin/dev.sh` to v0.1.0 content (server-only; drops lines 11-13 `TUI_JSON/TUI_SPEC` setup and lines 21-33 `node -e` tui.json mutation; keeps `SERVER_LINK` symlink and the `opencode --version` PATH check)
- EDIT: `.gitignore` (append `q.json` so it cannot reappear)

**Acceptance criteria:**

- [ ] `git status` shows only the new/changed files from Tasks 2-7 (rename, `package.json` edits, `.npmignore`, `bin/install.sh`, README rewrite) plus the deleted items as a clean diff.
- [ ] `ls src/` shows exactly: `config.js`, `detect-reasoning.js`, `index.js`, `render.js` (no `tui.jsx`, no `sidebar.js`).
- [ ] `ls test/` shows exactly: `config.test.js`, `detect-reasoning.test.js`, `fixtures/`, `plugin.test.js`, `render.test.js` (no `tui.test.js`).
- [ ] `bin/dev.sh` does not reference `tui.json`, `TUI_SPEC`, or `tui.jsx`; the only symlink created is the server-side `SERVER_LINK="$PLUGIN_DIR/think-separator-plugin.js"` symlink (later renamed in Task 2).
- [ ] `q.json` is absent from the working tree AND from the next git commit.

**Step-by-step:**

1. `git restore bin/dev.sh` to discard the in-tree edits added since `v0.1.0`.
2. `git rm --cached src/tui.jsx src/sidebar.js test/tui.test.js` (or `git rm -f` if needed).
3. `rm -f q.json`.
4. Append `q.json` to `.gitignore`.
5. Verify: `git status --short` shows only the intended diffs; `npm test` exits 0 with 19 tests passing.

**TDD:**

- This task removes code, not adds. The acceptance check `npm test` must continue to pass (19/19) after the cleanup.
- How to run: `npm test`.

**Reviewer focus:**

- **[BLOCKER] correctness:** Confirm `bin/dev.sh` matches the v0.1.0 version (no `node -e` block for tui.json).
- **[BLOCKER] cleanliness:** `git status --short` must NOT show `q.json` or any of the deleted files.
- **[SUGGESTION] gitignore hygiene:** Move `q.json` higher in `.gitignore` for visibility.

### Task 2 — Mechanical rename (`think-separator-plugin` → `opencode-think-separator-plugin`)

**Files touched (every literal occurrence):**

- `package.json:2` (`name`)
- `package.json:40,43,45` (`repository.url`, `bugs.url`, `homepage`) — see §6 open question on GitHub repo URL
- `README.md:1,12,13,22,29,65` (title, clone URL, install commands, plugin array entry, plugin options example)
- `examples/opencode.json:3` (the string in the `plugin` array)
- `src/index.js:2` (JSDoc header comment) and `src/index.js:98` (`id: 'think-separator-plugin'` — the plugin identifier exposed to opencode's loader)
- `docs/ARCHITECTURE.md:1` (title), `docs/ARCHITECTURE.md:146` (the JSDoc-style import example)
- `AGENTS.md:1,37` (project name heading and single-domain declaration)
- `.harness/domains.yaml:2` (`project.name`)
- `PLAN.md:1,5,6,156`
- `bin/dev.sh:11` (`SERVER_LINK="$PLUGIN_DIR/think-separator-plugin.js"`)
- `bin/harness-load.sh:2`

**Files NOT touched (intentional):**

- `docs/superpowers/plans/think-separator-0.1.0.md` — historical plan, keep as-is.
- `test/fixtures/*.json` — no occurrences.
- `test/*.test.js` — no occurrences (tests import by relative path).
- `.opencode/agent/orchestrator.md`, `.opencode/agent/dev-think-separator.md` — references are to `topic_key: think-separator-task-<n>` for Engram memory keys. Leave untouched.

**Acceptance criteria:**

- [ ] `grep -rn 'think-separator-plugin' --include='*.{js,json,md,sh,yaml,yml}' --exclude-dir=node_modules --exclude-dir=.superpowers --exclude-dir=.opencode .` returns ONLY matches inside `docs/superpowers/plans/think-separator-0.1.0.md` (historical plan) and `.opencode/agent/*.md` (orchestrator internal memory keys). Zero other matches.
- [ ] `package.json:2` reads `"name": "opencode-think-separator-plugin"`.
- [ ] `src/index.js:98` reads `id: 'opencode-think-separator-plugin'`.
- [ ] `examples/opencode.json:3` reads `"opencode-think-separator-plugin"`.
- [ ] `bin/dev.sh:11` reads `SERVER_LINK="$PLUGIN_DIR/opencode-think-separator-plugin.js"`.
- [ ] `npm test` still passes 19/19.

**Step-by-step:**

1. Run baseline grep before edits.
2. Apply the literal substitution per §4 Task 2 files-touched list.
3. Re-run grep; assert only whitelisted historical/internal matches remain.
4. Run `npm test`; assert 19/19 pass.

**TDD:**

- No new tests required (rename is mechanical). Tests import by relative path, not package name.
- The acceptance check IS the test: grep returns zero unexpected matches.

**Reviewer focus:**

- **[BLOCKER] completeness:** If any user-visible match is missed, downstream install instructions break.
- **[BLOCKER] id-field consistency:** `src/index.js:98` `id` must equal `package.json:2` `name` exactly.
- **[SUGGESTION] docs drift:** illustrative examples should track real names.

### Task 3 — `package.json` updates for npm publish

**Files touched:**

- `package.json` (the whole file: ~46 lines)

**Acceptance criteria:**

- [ ] `name` = `"opencode-think-separator-plugin"`.
- [ ] `version` = `"0.1.0"` (UNCHANGED).
- [ ] `main` = `"src/index.js"`.
- [ ] `exports` unchanged.
- [ ] `files` = `["src/", "bin/install.sh", "README.md", "LICENSE"]`.
- [ ] `scripts.prepublishOnly` = `"node --check src/index.js && npm test"` (NEW; safety gate).
- [ ] `scripts.test`, `scripts.test:watch`, `scripts.lint`, `scripts.harness:*` UNCHANGED.
- [ ] `bin` = `{ "opencode-think-separator-plugin-install": "bin/install.sh" }` (NEW).
- [ ] `keywords` appends `"opencode-ai"` and `"plugin"` to existing entries.
- [ ] `engines.node` unchanged (>=18.0.0).
- [ ] `license` unchanged (MIT).
- [ ] `repository.url`, `bugs.url`, `homepage` updated only if GitHub repo is renamed (see §6).

**Step-by-step:**

1. Open `package.json` and apply field-level edits.
2. Validate JSON: `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"`.
3. Validate `prepublishOnly`: `npm run prepublishOnly` must run `node --check src/index.js && npm test` and exit 0.
4. Validate bin entry: `node -e "const p = require('./package.json'); console.log(p.bin)"`.

**TDD:**

- No new tests; this is metadata. `npm run prepublishOnly` IS the executable check.

**Reviewer focus:**

- **[BLOCKER] no version bump.**
- **[BLOCKER] prepublishOnly syntax:** must be a single shell string.
- **[BLOCKER] files whitelist:** if `bin/install.sh` is missing from `files`, the `bin` symlink is broken.
- **[SUGGESTION] description tightening.**

### Task 4 — `.npmignore`

**Files touched:**

- CREATE: `.npmignore` (does not exist today)

**Acceptance criteria:**

- [ ] File exists at repo root.
- [ ] Tarball inspection (`npm pack --dry-run`) shows ONLY `[package.json, README.md, LICENSE, src/, bin/install.sh]`.

**Step-by-step:**

Create `.npmignore` with the following content:

```
# Dev / harness / superpowers internals
.harness/
.opencode/
.superpowers/
docs/
test/
examples/

# Dev-only bin scripts (bin/install.sh IS shipped via files whitelist)
bin/dev.sh
bin/harness-load.sh

# Env + local config
.env
.env.*
opencode.json

# Orphan + transient
q.json

# Lock files
package-lock.json
*.lock

# Build artifacts
dist/
node_modules/
*.log
```

**TDD:**

- Not a code change. Verification is via Task 7's `npm publish --dry-run` tarball inspection.

**Reviewer focus:**

- **[BLOCKER] over-exclusion:** if `src/` ends up in `.npmignore`, the package ships empty.
- **[BLOCKER] under-exclusion:** if dev folders ship, the package leaks internals.
- **[SUGGESTION] defensive entries.**

### Task 5 — `bin/install.sh` (one-shot installer, server-only)

**Files touched:**

- CREATE: `bin/install.sh`

**Acceptance criteria:**

- [ ] File exists at `bin/install.sh`.
- [ ] `chmod +x bin/install.sh` succeeds.
- [ ] `bash -n bin/install.sh` exits 0 (syntax check).
- [ ] Running `bash bin/install.sh`:
    - Creates `opencode.json` if absent.
    - Adds `"opencode-think-separator-plugin"` to the existing `plugin` array (or creates array if missing).
    - Does NOT touch `tui.json` at any path.
    - Backs up `opencode.json` to `opencode.json.bak.<ISO-timestamp>` before editing.
    - Prints next-step message: "restart opencode to load the plugin".
- [ ] Re-running is idempotent (plugin name appears exactly once).

**Step-by-step:**

Write `bin/install.sh`:

```bash
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
  tmp="$(mktemp)"
  jq --arg p "$PLUGIN_NAME" '
    if (.plugin // [] | index($p)) then .
    else .plugin = ((.plugin // []) + [$p]) end
  ' "$CONFIG_FILE" > "$tmp" 2>/dev/null || cp "$CONFIG_FILE" "$tmp"
  mv "$tmp" "$CONFIG_FILE"
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
```

Then `chmod +x bin/install.sh` and `bash -n bin/install.sh`.

**TDD:**

- The script is bash; no JS tests. The acceptance criteria ARE the tests.

**Reviewer focus:**

- **[BLOCKER] no tui.json mutation.**
- **[BLOCKER] idempotency.**
- **[BLOCKER] backup.**
- **[SUGGESTION] jq preference.**

### Task 6 — Rewrite `README.md` install section

**Files touched:**

- EDIT: `README.md` (rewrite install section + remove obsolete TUI limitation)

**Acceptance criteria:**

- [ ] `README.md:1` reads `# opencode-think-separator-plugin`.
- [ ] "Install" section leads with the `opencode.json` path; `bin/install.sh` listed as alternative.
- [ ] "From source (dev path)" preserved with renamed URLs.
- [ ] "Configuration" section uses new name.
- [ ] "Known limitations (v0.1.0)" REMOVES the bullet about TUI sidebar indicator (line 84). Streaming-rewrite and synthetic-fixtures bullets preserved.
- [ ] `npm test` still passes.

**Step-by-step:**

Rewrite title and install section per the example below:

````markdown
# opencode-think-separator-plugin

An opencode plugin that visually separates the model's reasoning block from its final response, server-side.

Provider-agnostic — works with Anthropic (Claude), OpenAI (o3, o1), Google (Gemini 2.5 Pro), and MiniMax (M3). Zero runtime dependencies. Opencode-version-agnostic ≥ 1.15.

## Install

### Recommended: edit `~/.config/opencode/opencode.json`

Add the plugin to your existing config:

```json
{
    "plugin": ["opencode-think-separator-plugin"]
}
```
````

opencode auto-installs npm packages on startup ([docs](https://opencode.ai/docs/plugins/#how-plugins-are-installed)). No `npm install -g` step required — the package is fetched into `~/.cache/opencode/node_modules/` at first run.

### Alternative: one-shot installer

```bash
npx opencode-think-separator-plugin-install
```

This writes the plugin entry into your `opencode.json` and prints a "restart opencode" prompt.

### From source (dev path)

```bash
git clone https://github.com/franky1234/think-separator-plugin.git
cd think-separator-plugin
./bin/dev.sh
```

`bin/dev.sh` symlinks the source into `~/.config/opencode/plugins/` and starts opencode.

```

**TDD:**
- No new tests. Acceptance criteria are visual inspection.

**Reviewer focus:**
- **[BLOCKER] remove TUI limitation:** confirm TUI sidebar indicator bullet is gone.
- **[BLOCKER] opencode.json is the primary path.**
- **[SUGGESTION] screenshot/GIF:** future follow-up.
- **[SUGGESTION] "How it works" examples:** keep verbatim.

### Task 7 — `npm publish --dry-run` validation

**Files touched:** none (command-only)

**Acceptance criteria:**
- [ ] `npm publish --dry-run --registry https://registry.npmjs.org/` exits 0.
- [ ] Tarball file listing contains EXACTLY: `package.json`, `README.md`, `LICENSE`, `src/*.js`, `bin/install.sh` — and nothing else.
- [ ] Tarball's `package.json` `bin` resolves correctly.
- [ ] Tarball's `src/index.js` imports parse: `node -e "import('./src/index.js').then(m => console.log(Object.keys(m)))"` logs the expected exports.
- [ ] `npm view opencode-think-separator-plugin` returns `npm ERR! code E404` (name is free).
- [ ] `npm pack --dry-run --json` parses and shows the same file list.

**Step-by-step:**
1. `npm pack --dry-run 2>&1 | tail -40` — capture file listing.
2. `npm pack --dry-run --json > /tmp/pack.json && node -e "const p = require('/tmp/pack.json'); console.log(p.files.map(f => f.path).sort().join('\n'))"` — canonical sorted list.
3. Assert the sorted list matches expected files whitelist.
4. `npm publish --dry-run --registry https://registry.npmjs.org/`.
5. `npm view opencode-think-separator-plugin` — must 404.
6. Smoke: extract tarball to /tmp/inspect, verify entry loads via Node import.

**TDD:**
- This task IS the test suite for Tasks 1-6.

**Reviewer focus:**
- **[BLOCKER] file list purity.**
- **[BLOCKER] entry resolves.**

---

## 5. Verification (overall plan-level)

- `npm test` passes.
- `npm publish --dry-run --registry https://registry.npmjs.org/` produces a tarball with ONLY `[package.json, README.md, LICENSE, src/, bin/install.sh]`.
- `tar -tzf` of the dry-run tarball shows expected file list.
- Manual smoke: extract tarball, `node -e "import('./src/index.js')"` confirms the entry loads.

## 6. Risks and mitigations

- **Risk: name collision on npm publish.** Mitigation: `npm view` before publish (validates name is free at the moment of publish; npm also enforces on `npm publish`).
- **Risk: opencode's auto-installer doesn't handle ESM-only `.js` (no CJS compiled).** Mitigation: the package.json `main` field points directly to `src/index.js` (ESM); opencode's runtime uses Bun, which supports ESM natively. Document a fallback Bun build step in README if needed (out of scope for this plan).
- **Risk: opencode plugin contract changes (the hook is `experimental.`).** Mitigation: pin opencode ≥ 1.15 in `peerDependencies` if opencode provides one; otherwise document minimum version in README. The current doc at `docs/COMPATIBILITY.md` already lists 1.18.18 as verified.
- **Risk: user installs manually instead of via opencode.json and gets confused.** Mitigation: README install section prioritizes opencode.json, mentions `bin/install.sh` as alternative.

### Open question for user (before FASE 3)

**Q1: GitHub repository slug.** The package name will be `opencode-think-separator-plugin` on npm, but the GitHub repo is currently `franky1234/think-separator-plugin`. Three options:

- (a) Rename the GitHub repo to `opencode-think-separator-plugin` (URLs in README update accordingly).
- (b) Keep the GitHub repo name; only `package.json:40,43,45` need to stay pointing at the old URL.
- (c) Leave for later — does not block the npm publish.

Default assumption for the spec: **(b) — keep the repo name, only `package.json:40,43,45` URLs stay as `think-separator-plugin`**. The user has implicitly accepted this in earlier conversation.

**Q2: Should `bin/install.sh` be invoked as `npx` from a global install?** The default spec assumes yes. If the user prefers an environment-variable pattern (`OPENCODE_PLUGIN_NAME=opencode-think-separator-plugin bin/install.sh`), it is a small adjustment (set `PLUGIN_NAME` from env in the script). This is a SUGGESTION, not a blocker.

## 7. Parked findings / future work

- **TUI sidecar** (preserved in git branch `feature/tui-sidecar-staging`): the staged work in `src/tui.jsx`, `src/sidebar.js`, `test/tui.test.js`, and the modified `bin/dev.sh` is to be discarded from main into a branch (or a local stash labeled `tui-sidecar-staging`). Revisit at v0.3.0 with: visual validation of the JSX render, an explicit registration path for users (NOT a `tui.json` mutation script), and a peerDependencies declaration for `@opentui/solid`.
- **Real provider response fixtures**: current fixtures are synthetic-pending-validation (see `test/fixtures/README.md` and `progress.md`); replace before v1.0.0.
- **SUGGESTION-1** (independent code review of `src/detect-reasoning.js`): one review pass to `dev-think-separator` or `qa` as a `FINDING-VERIFY` follow-up before v1.0.0.
- **Renaming the GitHub repo slug**: see §6 Q1.

## 8. Out of scope confirmation (repeated for clarity)

- Do NOT execute `npm publish`. The orchestrator confirms the dry-run; user runs the publish with 2FA.
- Do NOT create a new git tag.
- Do NOT install the plugin globally as part of this plan.
- Do NOT commit the renamed working tree without FASE 4 review (code-reviewer + qa).

---

## Appendix A — Acceptance gates summary

| Gate | After task | Verifier |
|---|---|---|
| Working tree restored | Task 1 | `git status --short` clean + `npm test` 19/19 |
| Rename complete | Task 2 | grep baseline + `npm test` 19/19 |
| Package metadata correct | Task 3 | `npm run prepublishOnly` exits 0 + JSON valid |
| Dev paths excluded | Task 4 | `npm pack --dry-run` tarball listing |
| Installer safe + idempotent | Task 5 | manual bash test + idempotency rerun |
| README accurate | Task 6 | visual review + grep |
| Tarball clean | Task 7 | `npm publish --dry-run` + smoke import |

Final gate: FASE 4 (code-reviewer APPROVE + qa PASS) before any commit of the renamed + npm-ready tree to main.
```
