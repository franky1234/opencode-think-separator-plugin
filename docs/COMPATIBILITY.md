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
