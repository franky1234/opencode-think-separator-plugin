# opencode V2 plugin fixes — Implementation Plan (rev. 2)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 3 currently-failed in-scope opencode V2 plugins — `opencode-think-separator-plugin`, `superpowers@git+...`, and local `nah-policy.js` — show as **OK** in the TUI plugin manager. think-separator ships a V2 adapter via a **v0.6.0** release; superpowers is **pinned to a V2-compatible version** (v7.0.0); nah-policy gets an additive V2 adapter. `engram` (already working) is the control.

**Architecture:** Adapter + wrapper fix-up. No new plugin features.

- **think-separator** (this repo): add a V2 `setup(ctx)` adapter to `src/index.js` (additive, keep V1 export), bump to **v0.6.0**, `npm publish --dry-run` (user runs real publish), then patch the npm wrapper cache to the new version + full wrapper shape (clears Rule A **and** Rule B).
- **superpowers** (third-party, git-only): pin to **v7.0.0** (first release shipping the V2 `default { id, setup }` adapter), verify, and patch the git wrapper cache shape if Rule A still bites.
- **nah-policy.js** (project-local): add a V2 `setup(ctx)` adapter mirroring `~/.config/opencode/plugins/engram.ts` lines 1026-1149.

**Tech Stack:** Plain bash + node --test + opencode CLI. No new dependencies. No migration. Commits only for source changes in this repo (T2 + T4 → `upgrade-v5`).

**Spec:** This file. (No upstream spec — derived from Engram observations #150/#66 + T1 runtime diagnostic + user's 2026-10-13 decisions.)

**Base commit:** Current HEAD on `upgrade-v5` (verified at session start: 195/195 tests, v0.5.0 tagged).

---

## Global Constraints

These apply to every task.

- **No commits to wrapper files in `~/.cache/opencode/packages/`** — those live outside the repo and opencode rewrites them on next `plugin add`. Wrapper state is ephemeral by design. We document what we set but never try to git-track it.
- **Wrapper patches are best-effort** — opencode V2 may rewrite the wrappers at any time (per Engram #150). The fix is durable only insofar as opencode does NOT re-run `plugin add`. If it does, the T1 diagnostic explains how to re-apply.
- **Rule A vs Rule B are two separate gates** (from T1 §3). Rule A (`Plugin package has no server or TUI entrypoint`) is cleared by a complete wrapper `package.json` with `name`/`version`/`main`/`exports`. Rule B (`Plugin must export a default definition with an id and an effect or setup function`) is cleared by a V2 adapter in the plugin *source*. Both layers are required for the two npm/git plugins.
- **T2 + T4 MUST keep all tests green** (`npm test` plus `node --test .opencode/plugins/__tests__/*.test.js`). The V1 export shape stays; the V2 adapter is **additive only**.
- **Don't touch `~/.config/opencode/cli.json`** in this plan. Config edits are limited to: project `opencode.json` (superpowers pin, T3) and, for think-separator, only the *wrapper cache* — NOT the `~/.config/opencode/opencode.json` plugin array (T2 keeps that tuple as-is).
- **`opencode serve --service` caches plugin list in-memory** (per Engram #150). Any wrapper/config patch needs the running session to reload (or `:q` and re-launch). Document the reload step in each task.

---

## Task 1 — Diagnóstico en runtime de opencode V2 plugin loader

**✓ DONE (T1, see `task-1-report.md`)** — closed DONE_WITH_CONCERNS on 2026-10-13.

Kept as task 1 for the record. The 8-item runtime diagnostic is filed at `.superpowers/sdd/opencode-v2-plugin-fixes/task-1-report.md`. Key conclusions that reshape T2-T4:

1. `opencode v2.0.28` enforces **two** validation rules (Rule A wrapper entrypoint, Rule B default `{id, effect|setup}` export).
2. `opencode plugin add` has **no `--force` and no `--version`** flag → the original Option A is impossible.
3. think-separator v0.5.0 (npm `latest`) only exports `{ id, server }` → needs a V2 adapter + a new release (v0.6.0).
4. superpowers@6.3.0 has **no default export** → needs a V2-compatible version (found: v7.0.0, see T3).
5. `opencode-subagent-statusline` is **not loaded** (not in any config plugin array) — the "identical shape but OK" control is invalid.

---

## Task 2 — think-separator v0.6.0 release + wrapper patch

**Trigger:** T1 closed. This task ships the V2 adapter for think-separator and patches its npm wrapper.

**Strategy:** Additive V2 `setup(ctx)` adapter in this repo → release v0.6.0 → patch the wrapper cache to `^0.6.0` with a complete wrapper shape. (Option A is eliminated per T1 §5; Option B/C — wrapper rewrite — is the base move but *insufficient alone*: Rule B requires the source adapter too.)

**Files:**

- EDIT: `src/index.js` — add V2 `setup(ctx)` adapter (additive; keep V1 `OpenCodeThinkSeparatorPlugin` export and default `{ id, server }`).
- NEW: `test/*.test.js` (or existing test file) — test for the V2 adapter shape.
- EDIT: `package.json` — version `0.5.0` → `0.6.0`.
- WRITE (outside repo): `~/.cache/opencode/packages/opencode-think-separator-plugin@latest/package.json` — bump dep `^0.5.0` → `^0.6.0` + add `name`/`version`/`main`/`exports` pointing at `node_modules/opencode-think-separator-plugin/src/index.js`.

**Interfaces:**

- Consumes: `.superpowers/sdd/opencode-v2-plugin-fixes/task-1-report.md` (V2 contract + wrapper-shape recipe).
- Produces: `task-2-report.md` with `npm publish --dry-run` output, `opencode plugin list` post-fix, and commit SHA.

**Steps:**

- [ ] **Step 2.1:** TDD — write a test asserting the V2 `setup(ctx)` adapter shape (default export has `setup` function; exported `id`; per the V2 contract from T1 §3 Rule B).
- [ ] **Step 2.2:** Implement `setup(ctx)` in `src/index.js` (additive — keep V1 `OpenCodeThinkSeparatorPlugin` export and default `{ id, server }`). Mirror the V1 → V2 hook translation pattern from `~/.config/opencode/plugins/engram.ts` lines 1026-1149.
- [ ] **Step 2.3:** Bump `package.json` version `0.5.0` → `0.6.0`.
- [ ] **Step 2.4:** `npm run check:fix` — must be clean (195 → ~196 tests).
- [ ] **Step 2.5:** `npm publish --dry-run` — capture output, document for user (user runs the real publish with 2FA; **do NOT actually publish**).
- [ ] **Step 2.6:** Patch the wrapper cache — rewrite `~/.cache/opencode/packages/opencode-think-separator-plugin@latest/package.json` to bump dep `^0.5.0` → `^0.6.0` AND add valid wrapper shape (`name`, `version`, `main`, `exports` → `node_modules/opencode-think-separator-plugin/src/index.js`).
- [ ] **Step 2.7:** `npm install --force` inside the wrapper dir to fetch v0.6.0.
- [ ] **Step 2.8:** Reload TUI and verify `opencode plugin list` shows think-separator as **OK** (no `-` in ID column).
- [ ] **Step 2.9:** Commit source changes to `upgrade-v5`: `git commit -m "feat: V2 adapter for OpenCode V2 plugin loader (v0.6.0)"`.
- [ ] **Step 2.10:** Write `task-2-report.md` (dry-run output, wrapper diff, `plugin list` capture, commit SHA).

---

## Task 3 — superpowers version pin (V2-compatible) OR upstream-blocked

**Trigger:** Sub-deliverable A investigation (this session) already resolved the version question — **found V2-compatible v7.0.0**.

**Investigation outcome (from sub-deliverable A):**

- npm `superpowers` (`0.0.2`) is an **unrelated placeholder** ("TODO: description", 01studio, `main: lib/superpowers.js`). The real superpowers is **git-only** (`github.com/obra/superpowers`).
- Installed `6.3.0` (commit `b36e0829`) exports only `export const SuperpowersPlugin` — **no default export, no setup** (fails Rule B).
- **v7.0.0** (tag `v7.0.0`, resolved commit `bb92a77741419a4ab5f06e711a283343f1ada0c3`, released 2026-10-10) ships `export default { id: 'superpowers', server: SuperpowersPlugin, setup }` with a `setup(ctx)` registering skills via `ctx.skill.transform()` — **clears Rule B**.

**Strategy:** Pin the project config to v7.0.0 (the only place superpowers is referenced — project `opencode.json` line 7; it is **not** in `~/.config/opencode/opencode.json`). Then verify; if the git wrapper cache still lacks `name`/`main`/`exports` (Rule A), patch it to point at `node_modules/superpowers/.opencode/plugins/superpowers.js` (mirroring T2's wrapper patch).

**Files:**

- EDIT: `opencode.json` — change `superpowers@git+https://github.com/obra/superpowers.git#b36e0829c6d0140e93cfef2ca599b1b07d4a7797` → `superpowers@git+https://github.com/obra/superpowers.git#v7.0.0`.
- WRITE (outside repo, only if Rule A still bites): `~/.cache/opencode/packages/superpowers@git+https:/github.com/obra/superpowers.git/package.json` — complete wrapper shape.

**Interfaces:**

- Consumes: sub-deliverable A findings (this session).
- Produces: `task-3-report.md` with the pin diff, `opencode plugin list` post-reload, and any wrapper patch applied.

**Steps:**

- [x] **Step 3.1:** Apply the pin — edit project `opencode.json` plugin array to `superpowers@git+https://github.com/obra/superpowers.git#v7.0.0` (resolved commit `bb92a777...`).
- [x] **Step 3.2:** Refresh the cache — `opencode plugin add "superpowers@git+https://github.com/obra/superpowers.git#v7.0.0"` (or rely on reload re-resolve), then reload the TUI.
- [x] **Step 3.3:** Verify `opencode plugin list` — superpowers should show ID `superpowers`. If it still shows `-`, inspect the wrapper cache and patch `name`/`main`/`exports` (Rule A) pointing to `node_modules/superpowers/.opencode/plugins/superpowers.js`.
- [x] **Step 3.4:** Mark T3 `DONE` regardless of A or B (pin applied **or** upstream-blocked documented) — both are valid investigation outcomes.
- [x] **Step 3.5:** Write `task-3-report.md`.

**Fallback (B — only if v7.0.0 pin is found unusable at runtime):** write a section in `docs/UPGRADE-NOTES.md` (new file) documenting upstream-blocked status + workaround (remove superpowers from config or wait for upstream). T3 still closes `DONE`.

---

## Task 4 — V2 adapter para `nah-policy.js` local plugin

**Trigger:** T1 §7 confirmed nah-policy fails Rule B (exports only `{ id, server }`, no `setup`).

**Strategy:** Mirror the V2 adapter pattern from `~/.config/opencode/plugins/engram.ts` lines 1026-1149 (`setupEngramV2`, `V2Context`, hook translation). Adapt the V1 hooks `nah-policy.js` already exposes (`tool.execute.before`).

**Files (en el repo):**

- EDIT: `.opencode/plugins/nah-policy.js` — agregar V2 adapter aditivo, sin tocar exports V1 existentes.
- NO EDIT: tests, package.json, opencode.json.
- NEW: `.opencode/plugins/v2-adapter.js` (opcional) — si el adapter es largo, extraerlo aquí.

**Interfaces:**

- Consumes: T1's confirmation that the V2 adapter is the missing piece.
- Produces: `task-4-report.md` con `npm test` output (full 195/195 + nah-policy tests). El plugin se carga en opencode V2 sin "failed" status.

**Steps:**

- [ ] **Step 4.1:** `cd /home/franklin/Desktop/REPO/klassapp/think-separator-plugin && npm test && node --test .opencode/plugins/__tests__/*.test.js` — baseline
- [ ] **Step 4.2:** Implementar V2 adapter aditivo en `.opencode/plugins/nah-policy.js` (mantener V1 intacto)
- [ ] **Step 4.3:** Agregar test que confirme `setup` exporta hooks compatibles con V2
- [ ] **Step 4.4:** `npm run check:fix` (quality gate completo)
- [ ] **Step 4.5:** Commit en branch upgrade-v5: `git add .opencode/plugins/nah-policy.js test && git commit -m "feat(nah-policy): add V2 adapter (opencode plugin loader compatibility)"`
- [ ] **Step 4.6:** Reload opencode TUI y verificar que el local plugin ya no aparece failed
- [ ] **Step 4.7:** Escribir `task-4-report.md` con summary, test counts y commit SHA

---

## Verification

This plan is **DONE** when:

- `opencode plugin list` shows **0 "failed"** among the in-scope plugins: `opencode-think-separator-plugin` (OK), `superpowers@git+...#v7.0.0` (OK **or** documented-blocked), and local `nah-policy.js` (OK). The ID column must be populated (no `-`).
- `engram` (control) remains OK — it is the reference for a valid V2 plugin and must not regress.
- superpowers outcome is concrete: **pinned to v7.0.0** (verified in `plugin list`) OR **documented-blocked** in `docs/UPGRADE-NOTES.md`.
- `~/.cache/opencode/packages/opencode-think-separator-plugin@latest/node_modules/opencode-think-separator-plugin/package.json` reports `"version": "0.6.0"` (after the real publish the user runs).
- `npm run check:fix` exits 0 (195 → ~196 tests + nah-policy tests, biome + tsc clean).
- Commits on `upgrade-v5` for T2 (`feat: V2 adapter ... (v0.6.0)`) and T4 (`feat(nah-policy): add V2 adapter ...`).
- All task reports filed under `.superpowers/sdd/opencode-v2-plugin-fixes/task-{1,2,3,4}-report.md`.

> **Out of scope (not a success criterion):** `/tmp/subagent-monitor-dev` is a 4th failed local TUI plugin (T1 §2). It is NOT part of this plan; its `-` in `plugin list` is expected and must not be mistaken for a regression.

## Parked findings (deferred / not part of this plan)

- **`opencode-subagent-statusline` control assumption invalidated** — statusline is NOT loaded (absent from every config plugin array), so its "identical wrapper shape but OK" status never existed (T1 §4). It is a leftover cache dir from a prior `plugin add`.
- **Wrapper files are not durable** — opencode may rewrite them at any time (per Engram #150). Document the symptom + re-apply procedure in README troubleshooting section if T2 reveals a clean path.
- **`@opentui/solid` 0.6.x conflict upstream** — root cause is opencode bundling `0.6.2` while plugins want `<0.6`. Long-term fix is upstream (sst/opencode). Not in this plan's scope.
- **Subagent delegations aborted by server restarts** — if dev's `task` tool calls get interrupted mid-investigation, fall back to direct bash in this session (per Engram #150 learned note).

## Notes

- Plan directory in SDD workspace: `.superpowers/sdd/opencode-v2-plugin-fixes/` (gitignored).
- Plan file (this doc) lives in: `docs/superpowers/plans/2026-10-13-opencode-v2-plugin-fixes.md`.
- Spec source: Engram observation #150 (root-cause analysis) + #66 (T1 closure) + user's 2026-10-13 decisions (replan T2; investigate-then-pin-or-block superpowers; nah-policy unchanged).
- **superpowers is referenced ONLY in project `opencode.json`** (line 7), not in `~/.config/opencode/opencode.json` — the pin is a single-file edit.
