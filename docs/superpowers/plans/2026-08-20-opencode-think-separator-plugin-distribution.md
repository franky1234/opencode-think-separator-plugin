# opencode-think-separator-plugin v0.1.0 Distribution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repackage the existing `think-separator-plugin` v0.1.0 as `opencode-think-separator-plugin` on the npm public registry, server-side only, with one-shot `bin/install.sh` installer and clean tarball via `npm publish --dry-run` validation.

**Architecture:** Mechanically rename package metadata + docs + scripts from `think-separator-plugin` → `opencode-think-separator-plugin`. Drop the staged TUI sidecar work to a `feature/tui-sidecar-staging` branch. Add npm-publish readiness: `package.json` `bin`, `prepublishOnly`, `files` whitelist; `.npmignore` to exclude dev paths; `bin/install.sh` as a one-shot installer that ONLY edits `opencode.json` (never `tui.json`). Server-side code (`src/*.js`) is unchanged.

**Tech Stack:** Node.js ESM (`"type": "module"`), `node --test`, no runtime deps. npm for packaging. No Bun build step. No TypeScript migration. Plain bash for `bin/install.sh`.

**Spec:** `docs/superpowers/specs/2026-08-20-opencode-think-separator-plugin-distribution.md` (this plan implements it).

**Base commit:** `v0.1.0` (`a3994d9` on main).

---

## Global Constraints

These apply to every task; copied verbatim from the spec.

- Plugin **must** ship as plain JavaScript ESM (`"type": "module"` in `package.json`). No TypeScript migration. No Bun build step.
- Plugin **must** publish under `opencode-think-separator-plugin` on npm. Version published is `0.1.0` (no bump; same as the existing git tag `a3994d9`).
- Files whitelist in `package.json` must be exactly `["src/", "bin/install.sh", "README.md", "LICENSE"]`.
- `.npmignore` must exclude: `.harness/`, `.opencode/`, `.superpowers/`, `docs/`, `test/`, `examples/`, `bin/dev.sh`, `bin/harness-load.sh`, `.env`, `.env.*`, `opencode.json`, `q.json`, `package-lock.json`, `*.lock`, `dist/`, `node_modules/`, `*.log`.
- `bin/install.sh` must NEVER modify `~/.config/opencode/tui.json`. Only `opencode.json` (idempotent edit, with timestamped `.bak.<ts>` backup before destructive steps).
- Do NOT execute `npm publish` in this plan — orchestrator confirms dry-run; user runs the publish interactively with 2FA.
- Do NOT tag a new git version. Do NOT install globally. Do NOT commit renamed tree without FASE 4 review.
- GitHub repo slug (`franky1234/think-separator-plugin`) stays AS-IS per Q1 deferred by user — `package.json` `repository.url`, `bugs.url`, `homepage` are kept unchanged in this plan. Documented as parked finding for future rename.

---

## Task 1 — Working tree cleanup (restore v0.1.0 baseline)

**Files:**

- DELETE: `src/tui.jsx`
- DELETE: `src/sidebar.js`
- DELETE: `test/tui.test.js`
- DELETE: `q.json` (orphan at repo root)
- RESTORE: `bin/dev.sh` to v0.1.0 version via `git checkout a3994d9 -- bin/dev.sh`
- EDIT: `.gitignore` (append `q.json`)

**Interfaces:**

- Consumes: nothing.
- Produces: clean working tree at v0.1.0 baseline; `npm test` passes 19/19.

- [ ] **Step 1: Verify the dirty state baseline**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
git status --short
```

Expected: `M bin/dev.sh`, `RM src/tui.js -> src/tui.jsx`, `?? q.json`, `?? src/sidebar.js`, `?? test/tui.test.js`. If different, stop.

- [ ] **Step 2: Delete orphan `q.json`**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
rm -f q.json
ls q.json 2>/dev/null && echo "still there" || echo "removed"
```

Expected: `removed`.

- [ ] **Step 3: Delete TUI sidecar staged files**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
git restore --staged src/tui.jsx src/sidebar.js test/tui.test.js 2>/dev/null || true
rm -f src/tui.jsx src/sidebar.js test/tui.test.js
ls src/ test/
```

Expected: `src/` contains only `config.js`, `detect-reasoning.js`, `index.js`, `render.js`. `test/` contains only `config.test.js`, `detect-reasoning.test.js`, `fixtures/`, `plugin.test.js`, `render.test.js`.

- [ ] **Step 4: Restore `bin/dev.sh` to v0.1.0**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
git checkout a3994d9 -- bin/dev.sh
```

Expected: file restored. Verify with: `grep -c "node -e" bin/dev.sh` (should be 0) and `grep -c "TUI_JSON" bin/dev.sh` (should be 0).

- [ ] **Step 5: Append `q.json` to `.gitignore`**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
printf '\nq.json\n' >> .gitignore
tail -3 .gitignore
```

Expected: last line is `q.json`.

- [ ] **Step 6: Verify `npm test` still passes 19/19**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
npm test
```

Expected: ends with `# tests 19` / `# pass 19` / exit 0.

- [ ] **Step 7: Verify clean git status**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
git status --short
```

Expected: `M .gitignore`, `M bin/dev.sh` only. NO `q.json`, `tui.jsx`, `sidebar.js`, `tui.test.js`.

- [ ] **Step 8: Commit the cleanup**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
git add .gitignore bin/dev.sh
git commit -m "chore(cleanup): restore v0.1.0 working tree, drop staged TUI sidecar work"
```

Expected: 1 commit ahead of `a3994d9`.

> **Hard checkpoint.** Stop and let reviewer verify Step 7 / Step 8 outputs before moving to Task 2.

---

## Task 2 — Mechanical rename (`think-separator-plugin` → `opencode-think-separator-plugin`)

**Files touched:** `package.json`, `README.md`, `examples/opencode.json`, `src/index.js`, `docs/ARCHITECTURE.md`, `AGENTS.md`, `.harness/domains.yaml`, `PLAN.md`, `bin/dev.sh`, `bin/harness-load.sh`.

**DO NOT TOUCH:** `docs/superpowers/plans/think-separator-0.1.0.md` (historical plan filename); `test/fixtures/*`; `test/*.test.js`; `.opencode/agent/*.md` (Engram topic keys).

**Interfaces:**

- Consumes: clean v0.1.0 working tree (output of Task 1).
- Produces: every user-visible `think-separator-plugin` string renamed. Grep baseline → grep post must show ZERO matches. `npm test` passes 19/19.

- [ ] **Step 1: Capture the grep baseline**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
grep -rn 'think-separator-plugin' \
  --include='*.js' --include='*.jsx' --include='*.json' \
  --include='*.md' --include='*.sh' --include='*.yaml' \
  --exclude-dir=node_modules --exclude-dir=.superpowers --exclude-dir=.opencode . \
  > /tmp/rename-baseline.txt
cat /tmp/rename-baseline.txt
wc -l /tmp/rename-baseline.txt
```

Expected: a non-zero count, file paths + lines listed.

- [ ] **Step 2: Edit `package.json`**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
node -e "
const fs = require('fs');
const path = 'package.json';
const txt = fs.readFileSync(path, 'utf8');
fs.writeFileSync(path, txt.replaceAll('think-separator-plugin', 'opencode-think-separator-plugin'));
"
node -e "const p = require('./package.json'); console.log('name:', p.name); console.log('version:', p.version);"
```

Expected output: `name: opencode-think-separator-plugin`, `version: 0.1.0`.

- [ ] **Step 3: Edit `src/index.js` — header comment + `id` field**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
node -e "
const fs = require('fs');
const path = 'src/index.js';
const txt = fs.readFileSync(path, 'utf8');
fs.writeFileSync(path, txt.replaceAll('think-separator-plugin', 'opencode-think-separator-plugin'));
"
grep -n "id: 'opencode-think-separator-plugin'" src/index.js
```

Expected: exactly one match.

- [ ] **Step 4: Edit `examples/opencode.json`**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
node -e "
const fs = require('fs');
const path = 'examples/opencode.json';
const txt = fs.readFileSync(path, 'utf8');
fs.writeFileSync(path, txt.replaceAll('think-separator-plugin', 'opencode-think-separator-plugin'));
"
cat examples/opencode.json
```

Expected: `plugin` array contains `"opencode-think-separator-plugin"`.

- [ ] **Step 5: Edit README.md, AGENTS.md, PLAN.md, docs/ARCHITECTURE.md, bin/dev.sh, bin/harness-load.sh, .harness/domains.yaml**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
for f in README.md AGENTS.md PLAN.md docs/ARCHITECTURE.md bin/dev.sh bin/harness-load.sh .harness/domains.yaml; do
  node -e "
const fs = require('fs');
const path = process.argv[1];
const txt = fs.readFileSync(path, 'utf8');
if (txt.includes('think-separator-plugin')) {
  fs.writeFileSync(path, txt.replaceAll('think-separator-plugin', 'opencode-think-separator-plugin'));
  console.log('updated:', path);
} else {
  console.log('no-op:', path);
}
" "$f"
done
```

Expected: each file is `updated:` or `no-op:`.

- [ ] **Step 6: Re-run grep post-rename**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
grep -rn 'think-separator-plugin' \
  --include='*.js' --include='*.jsx' --include='*.json' \
  --include='*.md' --include='*.sh' --include='*.yaml' \
  --exclude-dir=node_modules --exclude-dir=.superpowers --exclude-dir=.opencode .
```

Expected output: zero matches. If any, fix before proceeding.

- [ ] **Step 7: Run `npm test`**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
npm test
```

Expected: 19/19 pass, exit 0.

- [ ] **Step 8: Commit the rename**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
git add package.json README.md AGENTS.md PLAN.md docs/ARCHITECTURE.md src/index.js examples/opencode.json bin/dev.sh bin/harness-load.sh .harness/domains.yaml
git status --short
git commit -m "chore(rename): rebrand to opencode-think-separator-plugin for npm publish"
```

Expected: 1 commit with all renamed files.

> **Reviewer gate.** Confirm grep baseline → grep post is zero.

---

## Task 3 — `package.json` updates for npm publish

**Files:** EDIT `package.json`.

**Interfaces:**

- Consumes: Task 2 output.
- Produces: `package.json` with `bin`, `prepublishOnly`, expanded `files` whitelist, extended `keywords`. JSON valid. `npm run prepublishOnly` exits 0.

- [ ] **Step 1: Snapshot current state**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
node -e "
const p = require('./package.json');
console.log('bin:', JSON.stringify(p.bin));
console.log('files:', JSON.stringify(p.files));
console.log('prepublishOnly:', p.scripts?.prepublishOnly);
console.log('keywords:', JSON.stringify(p.keywords));
"
```

Expected: `bin` undefined, `files` is `["src/","README.md","LICENSE"]`, `prepublishOnly` undefined.

- [ ] **Step 2: Apply field-level edits**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
node -e "
const fs = require('fs');
const path = 'package.json';
const p = JSON.parse(fs.readFileSync(path, 'utf8'));
p.bin = { 'opencode-think-separator-plugin-install': 'bin/install.sh' };
p.scripts = p.scripts || {};
p.scripts.prepublishOnly = 'node --check src/index.js && npm test';
p.files = ['src/', 'bin/install.sh', 'README.md', 'LICENSE'];
const additions = ['opencode-ai', 'plugin'];
p.keywords = Array.from(new Set([...(p.keywords || []), ...additions]));
fs.writeFileSync(path, JSON.stringify(p, null, 2) + '\n');
console.log('updated.');
"
```

- [ ] **Step 3: Verify**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
node -e "
const p = require('./package.json');
console.log('bin:', JSON.stringify(p.bin));
console.log('files:', JSON.stringify(p.files));
console.log('prepublishOnly:', p.scripts.prepublishOnly);
console.log('keywords (count):', p.keywords.length);
"
```

Expected: `bin` has the install entry; `files` has 4 entries including `bin/install.sh`; `prepublishOnly` is the gate script; `keywords` count grew.

- [ ] **Step 4: Validate JSON syntax**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('valid JSON')"
```

Expected: `valid JSON`.

- [ ] **Step 5: Run prepublishOnly gate**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
npm run prepublishOnly
```

Expected: runs `node --check src/index.js` silently then `npm test` (19/19). Exit 0.

- [ ] **Step 6: Run npm test separately**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
npm test
```

Expected: 19/19.

- [ ] **Step 7: Commit**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
git add package.json
git diff --cached --stat
git commit -m "build(package): add bin entry, prepublishOnly gate, expand files whitelist and keywords"
```

> **Reviewer gate.**

---

## Task 4 — Create `.npmignore`

**Files:** CREATE `.npmignore`.

**Interfaces:**

- Consumes: Task 3 output.
- Produces: `.npmignore` with the whitelist from spec.

- [ ] **Step 1: Confirm not exists**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
test ! -f .npmignore && echo "ok" || echo "exists"
```

- [ ] **Step 2: Write `.npmignore`**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
cat > .npmignore <<'NPMIGNORE'
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
NPMIGNORE
test -s .npmignore && wc -l .npmignore
```

Expected: line count >= 20.

- [ ] **Step 3: Preview tarball with `npm pack --dry-run --json`**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
npm pack --dry-run --json > /tmp/pack.json 2>&1
node -e "
const p = require('/tmp/pack.json');
const paths = (p.files || []).map(f => f.path).sort();
console.log(paths.join('\n'));
"
```

Expected: 7 entries (LICENSE, README.md, package.json, src/{config,detect-reasoning,index,render}.js). `bin/install.sh` will appear after Task 5.

- [ ] **Step 4: Commit**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
git add .npmignore
git commit -m "build(npmignore): exclude dev/harness/superpowers paths from published tarball"
```

> **Reviewer gate.**

---

## Task 5 — Create `bin/install.sh` (one-shot installer, server-only)

**Files:** CREATE `bin/install.sh`.

**Interfaces:**

- Consumes: Tasks 3-4 output.
- Produces: executable `bin/install.sh`. Edits only `opencode.json` (never `tui.json`). Idempotent. Creates backup.

- [ ] **Step 1: Confirm not exists**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
test ! -f bin/install.sh && echo "ok" || echo "exists"
```

- [ ] **Step 2: Write `bin/install.sh`**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
cat > bin/install.sh <<'INSTALLSH'
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
INSTALLSH
```

- [ ] **Step 3: chmod +x and syntax check**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
chmod +x bin/install.sh
bash -n bin/install.sh && echo "syntax ok"
```

Expected: `syntax ok`.

- [ ] **Step 4: Smoke-test 1 — fresh install (no existing config)**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
TMPHOME=$(mktemp -d)
HOME="$TMPHOME" bash bin/install.sh
echo "---"
cat "$TMPHOME/.config/opencode/opencode.json"
echo "---"
test ! -e "$TMPHOME/.config/opencode/tui.json" && echo "no tui.json created (correct)"
```

Expected: prints `installed:` + `next:`, then `{"plugin": ["opencode-think-separator-plugin"]}`, then `no tui.json created (correct)`.

- [ ] **Step 5: Smoke-test 2 — idempotency**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
TMPHOME=$(mktemp -d)
HOME="$TMPHOME" bash bin/install.sh
HOME="$TMPHOME" bash bin/install.sh
cat "$TMPHOME/.config/opencode/opencode.json"
COUNT=$(grep -o "opencode-think-separator-plugin" "$TMPHOME/.config/opencode/opencode.json" | wc -l)
test "$COUNT" -eq 1 && echo "idempotent (correct)"
```

Expected: `idempotent (correct)`. The plugin name appears exactly once.

- [ ] **Step 6: Smoke-test 3 — backup created when config pre-exists**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
TMPHOME=$(mktemp -d)
mkdir -p "$TMPHOME/.config/opencode"
echo '{"model":"already-here"}' > "$TMPHOME/.config/opencode/opencode.json"
HOME="$TMPHOME" bash bin/install.sh
ls "$TMPHOME/.config/opencode/"
cat "$TMPHOME/.config/opencode/opencode.json.bak."* | head -1
```

Expected: `ls` shows both `opencode.json` and `opencode.json.bak.<TS>`. Backup content is `{"model":"already-here"}`.

- [ ] **Step 7: Smoke-test 4 — `tui.json` never modified**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
TMPHOME=$(mktemp -d)
mkdir -p "$TMPHOME/.config/opencode"
echo '{"theme":"dark"}' > "$TMPHOME/.config/opencode/tui.json"
ORIG=$(cat "$TMPHOME/.config/opencode/tui.json")
HOME="$TMPHOME" bash bin/install.sh
NEW=$(cat "$TMPHOME/.config/opencode/tui.json")
test "$ORIG" = "$NEW" && echo "tui.json UNCHANGED (correct)"
```

Expected: `tui.json UNCHANGED (correct)`.

- [ ] **Step 8: Verify `npm pack --dry-run` includes `bin/install.sh`**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
npm pack --dry-run --json > /tmp/pack.json 2>&1
node -e "
const p = require('/tmp/pack.json');
const paths = (p.files || []).map(f => f.path).sort();
console.log(paths.join('\n'));
"
```

Expected: 8 entries (LICENSE, README.md, bin/install.sh, package.json, src/{config,detect-reasoning,index,render}.js). `bin/dev.sh` and `bin/harness-load.sh` absent.

- [ ] **Step 9: Commit**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
git add bin/install.sh
git status --short
git commit -m "feat(install): add bin/install.sh one-shot installer for opencode.json plugin array"
```

> **Reviewer gate.** All 4 smoke-tests pass; tarball listing shows exactly 8 entries.

---

## Task 6 — Rewrite `README.md` install section

**Files:** EDIT `README.md`.

**Interfaces:**

- Consumes: Task 5 output.
- Produces: README title `# opencode-think-separator-plugin`; install section leads with `opencode.json`; TUI sidebar limitation bullet removed. `npm test` passes.

- [ ] **Step 1: Snapshot structure**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
wc -l README.md
grep -n "^#" README.md
```

- [ ] **Step 2: Confirm TUI sidebar limitation exists**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
grep -n "TUI sidebar indicator" README.md
```

Expected: at least one line matches.

- [ ] **Step 3: Replace title**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
node -e "
const fs = require('fs');
const p = 'README.md';
let t = fs.readFileSync(p, 'utf8');
t = t.replace(/^# .*$/m, '# opencode-think-separator-plugin');
fs.writeFileSync(p, t);
"
grep -n '^# opencode-think-separator-plugin' README.md
```

Expected: line 1 reads `# opencode-think-separator-plugin`.

- [ ] **Step 4: Rewrite the install section**

Read `README.md` lines 1-60 and locate the `## Install` header. Replace the entire `## Install` block (up to the next `##` heading) with:

````markdown
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

````

- [ ] **Step 5: Verify install section uses new name**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
grep -c "opencode-think-separator-plugin" README.md
````

Expected: count >= 3 (title + plugin array + npx command).

- [ ] **Step 6: Remove the TUI sidebar limitation bullet**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
LINE=$(grep -n "TUI sidebar indicator" README.md | head -1 | cut -d: -f1)
[ -n "$LINE" ] && sed -i "${LINE}d" README.md
grep -n "TUI sidebar indicator" README.md && echo "STILL THERE" || echo "TUI sidebar bullet removed (correct)"
```

Expected: `TUI sidebar bullet removed (correct)`. If the bullet spans multiple lines, manually delete the continuation lines too.

- [ ] **Step 7: Run `npm test`**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
npm test
```

Expected: 19/19.

- [ ] **Step 8: Commit**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
git add README.md
git diff --cached --stat
git commit -m "docs(readme): install section leads with opencode.json path, drop obsolete TUI limitation"
```

> **Reviewer gate.**

---

## Task 7 — `npm publish --dry-run` validation

**Files:** none (command-only).

**Interfaces:**

- Consumes: Tasks 1-6 outputs.
- Produces: dry-run tarball listing matches expected exactly; smoke-import of entry succeeds.

- [ ] **Step 1: Final grep baseline**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
grep -rn 'think-separator-plugin' \
  --include='*.js' --include='*.jsx' --include='*.json' \
  --include='*.md' --include='*.sh' --include='*.yaml' \
  --exclude-dir=node_modules --exclude-dir=.superpowers --exclude-dir=.opencode . | wc -l
```

Expected: `0`.

- [ ] **Step 2: Final `npm test`**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
npm test
```

Expected: 19/19.

- [ ] **Step 3: Final `npm pack --dry-run --json` listing**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
npm pack --dry-run --json > /tmp/pack.json 2>&1
node -e "
const p = require('/tmp/pack.json');
const paths = (p.files || []).map(f => f.path).sort();
console.log(paths.join('\n'));
"
```

Expected: exactly 8 entries (LICENSE, README.md, bin/install.sh, package.json, src/{config,detect-reasoning,index,render}.js). No docs, test, examples, bin/dev.sh, .harness, .opencode, .superpowers.

- [ ] **Step 4: `npm publish --dry-run` against public registry**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
npm publish --dry-run --registry https://registry.npmjs.org/ 2>&1 | tail -25
```

Expected: exits 0; prints the tarball info including `package size`, `unpacked size`, total files count = 8.

- [ ] **Step 5: Confirm name is free on the registry**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://registry.npmjs.org/opencode-think-separator-plugin
```

Expected: `404`.

- [ ] **Step 6: Smoke-import the entry**

```bash
cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin
TMPDIR=$(mktemp -d)
npm pack --pack-destination="$TMPDIR" >/dev/null 2>&1
TARBALL=$(ls "$TMPDIR"/*.tgz)
cd "$TMPDIR"
tar -xzf "$(basename "$TARBALL")"
node -e "import('./package/src/index.js').then(m => console.log('entry loads:', Object.keys(m).sort().join(','))).catch(e => { console.error('FAIL:', e.message); process.exit(1); })"
```

Expected: `entry loads: default,detectReasoning,transformMessage,ThinkSeparator` (or similar — exact export list may differ; presence of `default` is the key check).

- [ ] **Step 7: Cleanup the temp tarball**

```bash
rm -rf "$TMPDIR"
```

- [ ] **Step 8: Final report**

Report back to orchestrator with:

- 6 commit hashes (one per tasks 1-6).
- Final `git log --oneline -7` showing the commit chain.
- Final `npm pack --dry-run --json` file listing.
- `npm view` confirms name is free.
- Status: `DONE` | `DONE_WITH_CONCERNS` | `BLOCKED`.

> **Final hard checkpoint.** Orchestrator confirms BLOCKERs and dispatches to FASE 4 (code-reviewer + qa) before any human-facing publish.

---

## Appendix A — Acceptance gates summary

| Gate                        | After task | Verifier                                                                                    |
| --------------------------- | ---------- | ------------------------------------------------------------------------------------------- |
| Working tree restored       | Task 1     | `git status --short` shows only `.gitignore` + `bin/dev.sh` modifications; `npm test` 19/19 |
| Rename complete             | Task 2     | grep pre count > 0; grep post count = 0; `npm test` 19/19                                   |
| Package metadata correct    | Task 3     | `npm run prepublishOnly` exits 0; JSON valid                                                |
| Dev paths excluded          | Task 4     | `npm pack --dry-run --json` listing 7 entries                                               |
| Installer safe + idempotent | Task 5     | 4 smoke-tests pass; tarball listing 8 entries                                               |
| README accurate             | Task 6     | visual grep + TUI limitation bullet removed                                                 |
| Tarball clean               | Task 7     | `npm publish --dry-run` 8 entries + `npm view` 404 + smoke-import OK                        |

Final gate: FASE 4 (code-reviewer APPROVE + qa PASS) before any human-facing publish.
