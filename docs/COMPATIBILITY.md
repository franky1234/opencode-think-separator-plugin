# Compatibility Matrix

Supported opencode versions and verified hook availability.

## Verified versions

| opencode version | Status     | Hook `experimental.chat.messages.transform` | Hook `experimental.session.compacting` | Notes                                                                                                                       |
| ---------------- | ---------- | ------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1.18.32 (local)  | ✓ verified | available (server-side)                     | available (server-side, opt-in)        | v0.4.0 baseline — full feature matrix (reasoning render, `compaction.stripReasoning`, `stripHistory`, code-masked extraction). |
| 1.18.18          | ✓ verified | available (server-side)                     | unavailable (hook is v0.4.0+)          | v0.3.0 baseline (render only; `compaction` opts in but the hook is newer).                                                  |

## Plan to expand coverage

The matrix above covers two verified versions. To grow it:

1. **Add a CI matrix** that installs each opencode version listed below in a throwaway dev container, loads the plugin via `bin/dev.sh`, runs a fixture-based smoke test that exercises the `experimental.chat.messages.transform` hook with a synthetic assistant message containing a `type: "reasoning"` part or `<think>` XML tags, and asserts the persisted message contains the `── Reasoning ──` header.
2. **Verify in priority order**: 1.15, 1.16, 1.17 (one major minor each), then 1.18.x point releases between 1.18.18 and 1.18.32.
3. **Probe the `experimental.session.compacting` hook** for each version: when the hook is absent, the plugin degrades gracefully (no directive is pushed; `compaction.stripReasoning` becomes a no-op).
4. **Update this table** with the verified status for each version.

## Hook availability by opencode version

The plugin relies on two server-side hooks. Neither is part of the documented stable API yet (both carry the `experimental.` prefix in the server-side hook).

| Hook                                       | Available since | Risk                                                                                                              |
| ------------------------------------------ | --------------- | ----------------------------------------------------------------------------------------------------------------- |
| `experimental.chat.messages.transform`     | opencode 1.15+  | The `experimental.` prefix signals this hook may change. It has been stable across 1.18.x.                       |
| `experimental.session.compacting`          | opencode 1.18.x | Newer API surface (introduced alongside v1.18). The plugin only registers this hook when `compaction.stripReasoning === true`. |

If either hook is removed in a future opencode release, this plugin breaks. The plugin degrades gracefully when `experimental.session.compacting` is absent (the compaction config becomes a silent no-op), but a removal of `experimental.chat.messages.transform` is a hard break. The mitigation: opencode's hook system has been growing, not shrinking; we monitor upstream changes before each release.

## What is NOT covered

- **Pre-1.15 opencode versions**: the `experimental.chat.messages.transform` hook did not exist in the form this plugin consumes. This plugin is incompatible with pre-1.15.
- **opencode-ai forks**: not tested. Only `anomalyco/opencode` is in scope.
- **Headless / non-TUI opencode invocations** (`opencode server` without `tui`): the server hooks fire regardless of whether the TUI is running, so the reasoning separator still appears in persisted messages and compaction directives still apply.
- **`experimental.session.compacting` hook signature drift**: the plugin reads `output.context` as `Array<string>`. If opencode changes that field's shape, the plugin becomes a no-op silently (the `Array.isArray` guard returns early on a non-array context). A breaking change upstream would surface as a no-op rather than a crash.

## How to verify locally

After loading the plugin via `bin/dev.sh`, ask your LLM a question that triggers reasoning. The response in your session should:

1. Begin with `> ### ── Reasoning ──` header (or your custom `label`).
2. Reasoning body in italicized blockquote (`> *…*`) for `style: "markdown"`, plain blockquote (`> …`) for `style: "quote"`, or a one-line badge + preview for `style: "compact"`.
3. Final response in normal weight below, cleanly separated by a blank line.
4. With `compaction: {stripReasoning: true}`, when OpenCode's session compactor runs, the resulting summary should omit the reasoning blocks while preserving the final response text.

For a quick way to exercise the parser with synthetic data:

```bash
node -e "
import('./src/core.js').then(({extractReasoningFromText, renderReasoning}) => {
  const raw = '<think>Let me think...\n3 + 4 = 7</think>The answer is 7.';
  const {reasoningTexts, cleanText} = extractReasoningFromText(raw);
  console.log(renderReasoning(reasoningTexts[0], {label: 'Reasoning', style: 'markdown'}));
  console.log('---');
  console.log(cleanText);
});
"
```

## Manual smoke verification (contributors)

These steps link the **source tree** into a live opencode session, exercise the reasoning hook end-to-end, and reverify that nothing in the test suite regressed. Use this when you change anything in `src/`, `bin/`, or opencode itself.

### 1. Verify nothing is broken before you start

```bash
npm test
```

Expect **190/190 green**. If the count drops, fix the regression before linking into opencode — a broken unit suite never gets better inside a live session.

### 2. Link the source into opencode

The plugin is loaded by opencode from `~/.config/opencode/plugins/` (one `.js` file per plugin; the file name must match the opencode `plugin` entry). The repo ships two helper scripts and a manual command.

**Recommended — `bin/dev.sh`** (symlinks source and launches opencode in one step):

```bash
./bin/dev.sh
```

This creates `~/.config/opencode/plugins/opencode-think-separator-plugin.js` as a symlink to `src/index.js` and then `exec`s `opencode`. Override the plugin directory with `OPENCODE_PLUGIN_DIR=/some/path` if you keep multiple opencode profiles.

**Manual — symlink only** (when you want to launch opencode yourself, e.g. from another shell or with extra flags):

```bash
ln -sf "$(pwd)/src/index.js" \
    "$HOME/.config/opencode/plugins/opencode-think-separator-plugin.js"
```

Verify the link points at the source tree, not at a published npm copy:

```bash
ls -l "$HOME/.config/opencode/plugins/opencode-think-separator-plugin.js"
# Expected: <…>/think-separator-plugin/src/index.js
```

If the path ends in `node_modules/opencode-think-separator-plugin/src/index.js`, you are pointing at the npm install rather than the source tree — remove the symlink and re-link.

**Alternative — published-package install** (end-user path, not the dev path):

```bash
npx opencode-think-separator-plugin-install
```

This adds the plugin name to `~/.config/opencode/opencode.json` and lets opencode auto-install the npm package on the next startup. It does **not** link the source tree; use it only to smoke-test a released version.

### 3. Trigger reasoning and inspect the TUI

Launch opencode (`./bin/dev.sh` already started it; otherwise `opencode`) and ask any LLM-backed question that produces chain-of-thought reasoning. In the TUI, the assistant response must:

1. Start with the configured header — default `> ### ── Reasoning ──` (`markdown` style) or your custom `label`.
2. Render the reasoning body inside an italicized blockquote (`> *…*`) for `markdown`, a plain blockquote (`> …`) for `quote`, or as a one-line badge + preview for `compact`.
3. End with a blank line followed by the final response, in normal weight.

If the reasoning block is missing or appears inline with the answer, open opencode's developer console (`Ctrl+X` in most TUI builds) and check for plugin-load errors. The most common cause is a stale symlink from a previous version of the plugin; `rm` it and re-run `bin/dev.sh`.

### 4. Verify the compaction hook (optional, opencode ≥ 1.18)

If your `opencode.json` includes `compaction: {stripReasoning: true}`, force a session compaction (usually `/compact` or by filling the context window) and confirm the compacted summary omits the reasoning block while keeping the final response text. Pre-1.18 opencode silently ignores the hook — see the table above.

### 5. Unlink when you are done

```bash
rm "$HOME/.config/opencode/plugins/opencode-think-separator-plugin.js"
```

`bin/dev.sh` does not clean up after itself — leaving the symlink in place points future sessions at this checkout, which is the point during development but a footgun once you move on.

## Automated CI matrix (cross-version guarantees)

Every push to `main` and every pull request runs a GitHub Actions matrix that exercises the plugin against the supported opencode version range on three Node.js LTS lines. The matrix is the contract this section documents.

### Supported matrix

| Dimension        | Versions                                                            | Source / rationale                                                                 |
| ---------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Node.js          | **18, 20, 22**                                                      | `package.json` `engines.node` is `>=18.0.0`. 18 is the LTS floor; 20 and 22 are the two active LTS lines at the time of writing. |
| opencode         | **≥ 1.15** (currently exercised on 1.15, 1.16, 1.17, then 1.18.18 → 1.18.32) | The `experimental.chat.messages.transform` hook ships in 1.15 (see "Hook availability by opencode version" above). PLAN.md and README both declare 1.15 as the lower bound. |
| Operating system | `ubuntu-latest` (matrix grows to macOS / Windows as needed)          | opencode is cross-platform; the matrix starts with Linux runners and adds others when a regression is reported. |

The full list of versions the CI matrix currently exercises lives in the workflow file at [`.github/workflows/ci.yml`](../.github/workflows/ci.yml). *(That file is created in a later step of the v5.1 plan; if you are reading this section before it lands, treat the matrix description above as the contract — when the workflow ships it must enumerate exactly those rows.)*

### What each matrix cell runs

1. `npm ci` — exact install against the locked `package-lock.json`.
2. `npm run check:fix` — Prettier → Biome → `tsc --noEmit` → `npm test`. The full quality gate, not just one slice, so a formatting regression fails CI on every Node line.
3. **Smoke fixture** (`test/smoke.test.js`): registers the plugin against a stub `experimental.chat.messages.transform` hook, feeds it a synthetic assistant message containing a `type: "reasoning"` part and an embedded `<think>…</think>` block, and asserts the persisted message contains the `── Reasoning ──` header. This is the cross-version guarantee: the hook contract must keep accepting the same message shape across the matrix.
4. **Provider fixture sweep**: every JSON file under `test/fixtures/` (Anthropic, OpenAI, Google, MiniMax, control negative, and any new fixtures added by future PRs) is fed through the detector and renderer; the rendered output is asserted against the expected string. Cross-provider correctness is checked on every cell, not just on the latest opencode.

### What this matrix guarantees

- **Hook contract stability.** If `experimental.chat.messages.transform` changes shape between opencode 1.15 and 1.18.x, the smoke fixture fails on the affected row.
- **Node runtime parity.** The same `npm run check:fix` runs on Node 18, 20, and 22; a runtime-only bug (e.g. relying on a Node 20+ API) surfaces on the failing row.
- **Pure-function correctness.** Every provider fixture is rendered on every matrix cell; a regression in detector or renderer logic fails everywhere, but isolating which rows fail narrows the scope (e.g. Node-version-specific = runtime bug; all-rows-failing = logic regression).

### What this matrix does **not** guarantee

See "What is NOT covered" above. In short: pre-1.15 opencode, opencode-ai forks, and silent `experimental.session.compacting` signature drift are out of scope. Downstream users who depend on those should pin an opencode version covered by the matrix and watch the upstream hook changelog.

