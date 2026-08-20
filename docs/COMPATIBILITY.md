# Compatibility Matrix

Supported opencode versions and verified hook availability.

## Verified versions

| opencode version | Status | Hook `experimental.chat.messages.transform` | Hook `TuiPlugin.slots.register` | Notes |
|---|---|---|---|---|
| 1.18.18 (local) | ✓ verified | available (server-side) | available (TUI-side) | baseline; plugin entry tests 19/19 pass |

## Plan to expand coverage

The matrix above covers a single version (the one running locally). To grow it:

1. **Add a CI matrix** that installs each opencode version listed below in a throwaway dev container, loads the plugin via `bin/dev.sh`, runs a fixture-based smoke test that exercises the `experimental.chat.messages.transform` hook with a synthetic assistant message containing a `type: "reasoning"` part, and asserts the persisted message contains the `── Reasoning ──` header.
2. **Verify in priority order**: 1.15, 1.16, 1.17 (one major minor each), then 1.18.x point releases.
3. **Update this table** with the verified status for each.

## Hook availability by opencode version

The plugin relies on two hooks. Neither is part of the documented stable API yet (both carry the `experimental.` prefix in the server-side hook).

| Hook | Where it lives | Risk |
|---|---|---|
| `experimental.chat.messages.transform` | server-side, defined in `packages/plugin/src/index.ts` | The `experimental.` prefix signals this hook may change. It has been stable across 1.18.x. |
| `TuiPlugin.slots.register` | TUI-side, defined in `packages/plugin/src/tui.ts` | Newer API surface (introduced alongside the v1 plugin loader). Stable since introduction. |

If either hook is removed in a future opencode release, this plugin breaks. The mitigation: opencode's hook system has been growing, not shrinking; we monitor upstream changes before each release.

## What is NOT covered

- **Pre-1.15 opencode versions**: the dual `Plugin`/`TuiPlugin` split and the `experimental.chat.messages.transform` hook did not exist. This plugin is incompatible with pre-1.15.
- **opencode-ai forks**: not tested. Only `anomalyco/opencode` is in scope.
- **Headless / non-TUI opencode invocations** (`opencode server` without `tui`): the server hook fires regardless of whether the TUI is running, so the reasoning separator still appears in persisted messages. The TUI-side indicator only renders when the TUI is active.

## How to verify locally

After loading the plugin via `bin/dev.sh`, ask your LLM a question that triggers reasoning. The response in your session should:

1. Begin with `── Reasoning ──` header (bold + underline).
2. Reasoning body in dim, 2-space indented.
3. Final response in normal weight, 2-space indented, separated by a blank line.
4. Sidebar (if TUI active and JSX stub resolved) shows a count indicator.