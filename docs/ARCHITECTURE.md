# opencode-think-separator-plugin Architecture

This document describes the plugin's contract, detection heuristic, render pipeline, and configuration API as of v0.4.0.

For the opencode plugin API surface (hooks, signatures, compatibility matrix), see [COMPATIBILITY.md](./COMPATIBILITY.md).
For the cross-version support matrix, see [COMPATIBILITY.md](./COMPATIBILITY.md).

## 1. Plugin contract

The plugin ships a single server-side hook from `src/index.js`. Opencode's v1 plugin loader consumes the default export `{id, server}`, where `server` is an async factory returning an object with one or two hook implementations.

### Server-side factory (`src/index.js`)

```js
export const ThinkSeparator = async (_input, options) => {
    const baseConfig = mergeConfig(options || {})
    const plugin = {
        "experimental.chat.messages.transform": async (_hookInput, output) => {
            if (!output || !Array.isArray(output.messages)) return

            // Optional v0.4.0+ history-pruning step: when `stripHistory` is enabled,
            // drop the rendered reasoning block from historical assistant messages
            // BEFORE the per-message transform loop runs. Keeps the most recent
            // `maxHistoryReasoningTurns - 1` historical turns intact.
            if (baseConfig.stripHistory === true) {
                const maxTurns = baseConfig.maxHistoryReasoningTurns ?? 1
                stripHistoryReasoning(output.messages, maxTurns)
            }

            for (const msg of output.messages) {
                if (msg.info?.role !== "assistant") continue
                const modelId = msg.info?.model
                const perMsgConfig = resolveModelConfig(modelId, baseConfig)
                transformMessage(msg, perMsgConfig)
            }
        }
    }

    // Optional v0.4.0+ compaction hook: registered only when `compaction.stripReasoning`
    // is true. Pushes a directive into `output.context` so the compactor drops reasoning
    // blocks before generating the compacted summary.
    if (baseConfig.compaction?.stripReasoning === true) {
        plugin["experimental.session.compacting"] = async (_hookInput, output) => {
            if (!output || !Array.isArray(output.context)) return
            output.context.push(COMPACTION_STRIP_REASONING_DIRECTIVE)
        }
    }

    return plugin
}

export default {
    id: "opencode-think-separator-plugin",
    server: ThinkSeparator
}
```

### v0.4.0 hook summary

| Hook                                       | When registered                                      | Purpose                                                                              |
| ------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `experimental.chat.messages.transform`     | always                                               | Per-message rewrite: extract reasoning, render a styled block, prepend to the message. |
| `experimental.session.compacting`          | only when `compaction.stripReasoning === true`       | Context-window protection: ask the compactor to discard reasoning blocks from summaries. |

The plugin returns `{server: ThinkSeparator}` rather than the v0 "enumerated exports" fallback because that fallback iterates every module export and would mistake the `transformMessage` helper (exported here for testability and standalone use) for a second plugin function.

## 2. Detection heuristic

The server hook runs a 3-stage pipeline against each assistant message:

### Stage 1 — partition parts

`partitionMessageParts` (src/index.js) walks `msg.parts` and classifies each one:

- `type: "reasoning"` or `type: "thinking"` → extract `part.text` as reasoning; drop the part.
- `type: "text"` with XML tags inside → call `extractReasoningFromText(part.text, customTags)`; replace the text with `cleanText` and queue the extracted reasoning blocks.
- Anything else (tool_use, image, tool_result, file, …) → pass through untouched.

### Stage 2 — defense-in-depth fallback

When Stage 1 found NO reasoning, the hook runs `detectReasoning` (src/detect-reasoning.js) against a synthetic content[] built from the text parts, then against the raw message — first match wins. The fallback also surfaces thinking-metadata (`thinking_duration_ms`, `thinking_budget`, `thinking_tokens`) so the renderer can show a `(~1.2s, 450 tokens)` badge.

### Stage 3 — inject rendered block

`injectReasoningBlock` joins all extracted reasoning blocks with `\n\n`, runs them through `renderReasoning(text, {label, style, metadata})`, and prepends the result to the first text part (or inserts a new leading text part when none exists).

### v0.4.0 detection pipeline (src/detect-reasoning.js)

`extractReasoningFromText` is a 3-phase regex pass with a code-masking preprocessor:

```
input text
    │
    ▼
1. maskCodeSpans()              ← swap fenced & inline code for \x00-bounded sentinels
    │                                  (so <think> markup inside docs/examples is invisible)
    ▼
2. CLOSED regex                 <\s*(tag)\b[^>]*>([\s\S]*?)<\s*\/\s*\1\s*>
    │  captures & removes well-formed <tag>...</tag> blocks
    ▼
3. UNCLOSED regex               (?:^|\n)\s*<(tag)\b[^>]*>([\s\S]*)$
    │  captures & removes trailing <tag>...</tag> at line start
    ▼
4. ORPHAN regex                 (?:^|\n)\s*<\s*\/?\s*(tag)\b[^>]*>
    │  removes orphan opening/closing tags left over
    ▼
5. restoreCodeSpans()           ← swap sentinels back to original literals
    │
    ▼
{ reasoningTexts: string[], cleanText: string }
```

The UNCLOSED / ORPHAN regexes are line-anchored (`(?:^|\n)\s*<...`), so a mid-sentence mention of `<think>` like `"Note: <think> tags are used for reasoning."` is preserved verbatim rather than swallowed as live markup.

### Detection whitelist (`src/detect-reasoning.js`)

```js
export const REASONING_FIELDS = Object.freeze([
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
])

export const REASONING_TAG_NAMES = Object.freeze([
    "think",
    "thought",
    "thoughts",
    "reasoning",
    "antThinking",
    "thought_process",
    "chain_of_thought",
    "internal_thought"
])
```

### Field-to-provider coverage (verified against real captures in v0.4.0)

| Field / Tag                             | Provider(s)                          | Fixture                  | Detected |
| --------------------------------------- | ------------------------------------ | ------------------------ | -------- |
| `thinking` block                        | Anthropic, MiniMax                   | anthropic-thinking.json  | yes      |
| `redacted_thinking` block               | Anthropic Claude 3.7                 | anthropic-claude-3-7.json| yes      |
| `reasoning_content` top-level field     | OpenAI o3, DeepSeek R1               | openai-o3-real.json, deepseek-r1-real.json | yes |
| `thoughts` top-level field              | Google Gemini 2.5                    | google-gemini-2-5-real.json | yes   |
| `<think>...</think>` raw text           | DeepSeek-R1, Qwen, Ollama, MiniMax   | (deeper reasoning tags)  | yes      |
| `<thought>` raw text                    | Grok                                 | (grok tag)               | yes      |
| (no reasoning)                          | control fixture                      | no-reasoning-control.json | null    |

The fixtures are real provider captures (validated against live API responses, see `test/fixtures/README.md` for the validation glossary).

## 3. Render pipeline

The v0.4.0 renderer exposes **six styles** through the strategy map `RENDER_STYLES` in `src/render.js`:

| Style       | Header                                                           | Body                                              | Notes                                                                                  |
| ----------- | ---------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `markdown`  | `> ### ── Label ──`                                              | `> *line*` italic blockquote                      | Default; preserves code fences, indentation, list syntax verbatim.                     |
| `details`   | `<details><summary>Label</summary>`                              | HTML-escaped body                                 | Best for web / non-TUI consumers; collapses by default.                                |
| `strip`     | (none)                                                           | (none)                                            | Drops reasoning entirely — final response stands alone.                                |
| `raw`       | (none)                                                           | Reasoning text unchanged                          | Pass-through.                                                                          |
| `quote`     | `> ### ── Label ──`                                              | `> line` plain blockquote (no italics)            | Useful for terminals that render italic weakly. Same code-fence / list preservation.   |
| `compact`   | `> ### ── Label (N lines) ──`                                    | `> *first line preview*` + `> *…*`                | One-line summary with line-count badge for small terminals / long reasoning traces.    |

### `maxLines` truncation

`renderReasoning(text, {maxLines})` runs `truncateLines` first — it clips the input to `maxLines` lines and appends a plain `... [+N lines of reasoning truncated]...` indicator. The plain indicator is then decorated by the chosen renderer (so it lands inside an italic blockquote under `markdown`, inside a plain blockquote under `quote`, or counted as one more line in the badge under `compact`). `maxLines` is silently dropped when it is not a positive integer — defensive against user-input drift.

### Code-fence / list / indentation preservation

Lines inside a fenced code block (```` ``` ```` or `~~~`) are passed through verbatim with their original leading whitespace — fences and indentation survive the blockquote wrapping. Markdown list items (`- `, `* `, `+ `, `1. `) likewise pass through verbatim so the list marker stays at column 0 of the quoted content. Only paragraph lines receive the italic asterisk wrapping (`markdown` style) or plain blockquote prefix (`quote` style).

### Unified header for multiple reasoning blocks

When a message carries more than one reasoning source (e.g. `parts[0].type === "thinking"` + an embedded `<think>...</think>` in `parts[2].text`), the pipeline joins them with `\n\n` before calling `renderReasoning`. The result is a single `### ── Label ──` header followed by both bodies inside the same blockquote — no duplicate header lines.

### In-Memory Transformation Sequence

```
message arrives
    │
    ▼
experimental.chat.messages.transform fires
    │
    ├──► (optional) stripHistoryReasoning() — v0.4.0
    │        drops rendered reasoning from historical assistant messages,
    │        keeping the last `maxHistoryReasoningTurns - 1` historical turns intact
    │
    ├──► partitionMessageParts()            — Stage 1
    │        ├── collect reasoning text from type:reasoning / type:thinking parts
    │        ├── extractReasoningFromText() on text parts (with code-mask preprocessor)
    │        └── preserve tool_use / image / tool_result / file parts untouched
    │
    ├──► resolveFallbackReasoning()          — Stage 2
    │        runs detectReasoning on synthetic content[] + raw msg
    │        first non-empty detection wins; metadata is attached for badge rendering
    │
    ├──► injectReasoningBlock()              — Stage 3
    │        joins reasoning blocks with `\n\n` → renderReasoning() → prepend to first text part
    │
    ▼
message.parts mutated in place
```

A separate v0.4.0 hook `experimental.session.compacting` (registered only when `compaction.stripReasoning === true`) pushes the literal directive `"Discard all reasoning blocks (sections starting with '> ### ──' and continuing until the next blank line) before generating the compacted summary. Keep only the final response text."` into `output.context` — opencode's compactor reads these strings as guidance when generating the summary, so the compacted context drops the reasoning blocks (freeing tokens) while keeping the final response intact.

### Functions (`src/render.js`)

- `renderReasoning(text, optionsOrLabel, metadata)` — strategy dispatcher. Polymorphic second arg (string label OR `{label, style, metadata, maxLines}` object); `maxLines` clips first, then the chosen renderer decorates the truncation indicator.
- `formatDuration(ms)` — `"500ms"` / `"~1.2s"` / `"~1m 5s"` / `""` (defensive on nulls / non-finite).
- `formatTokens(n)` — `"1 token"` / `"N tokens"` / `""`.
- `formatHeader(label, metadata)` — header line `(duration, tokens)` badge when metadata present.
- `truncateLines(text, maxLines)` — clips to `maxLines` lines + plain truncation indicator.
- `RENDER_STYLES` — frozen strategy map.
- `renderResponse(text)` — indents each line of the response by 2 spaces (legacy API, unused by the v0.4.0 pipeline).
- `compose(detection, responseText, label)` — legacy helper; prefer `renderReasoning` + your own response rendering.

## 4. Config API

```js
import {defaultConfig, mergeConfig, resolveModelConfig} from "opencode-think-separator-plugin"

mergeConfig({label: "Thinking"})
// -> { label: 'Thinking' }

mergeConfig({})
// -> { label: 'Reasoning', style: 'markdown' } (= defaultConfig)

mergeConfig({label: "X", futureOption: 42})
// -> { label: 'X', style: 'markdown' }  (futureOption ignored — forward-compat)

mergeConfig({maxLines: 10, style: "compact"})
// -> { label: 'Reasoning', style: 'compact', maxLines: 10 }
//    `maxLines` and `style` are normalised (positive integer; ALLOWED_STYLES check).

mergeConfig({compaction: {stripReasoning: true}, stripHistory: true, maxHistoryReasoningTurns: 2})
// -> { label: 'Reasoning', style: 'markdown',
//      compaction: { stripReasoning: true },
//      stripHistory: true,
//      maxHistoryReasoningTurns: 2 }
```

### `mergeConfig` contract

- Frozen defaults: `{label: "Reasoning", style: "markdown"}`.
- `maxLines` survives only when it is a positive integer (floats, zero, negative, NaN, strings all drop).
- `compaction` survives only when it is a non-null plain object carrying at least one well-formed field (currently only `stripReasoning: true`).
- `stripHistory` survives only when the user supplies the literal boolean `true` (string `"true"`, `1`, object, `null` all drop so a typo cannot enable the feature).
- `maxHistoryReasoningTurns` survives only when it is a positive integer; the runtime fallback defaults to `1` when the user did not specify.
- `models`, `customTags` are dropped when absent or empty (key omission keeps `mergeConfig({})` deep-equal to `defaultConfig` for back-compat).
- Unknown keys are silently ignored.

### `resolveModelConfig(modelId, baseConfig)`

Iterates `baseConfig.models` in insertion order; first pattern that matches wins. Patterns are either exact (`"openai/o3-mini"`) or prefix wildcards (`"deepseek/*"` matches any id starting with `"deepseek/"`). Pattern `*` in any other position falls back to exact matching (parser stays total). Returns a fresh shallow copy with the override's `label`, `style`, and/or `maxLines` applied; `models` and `customTags` are passed through unchanged.

## 5. History pruning (v0.4.0)

When `stripHistory === true`, the chat-messages hook runs `stripHistoryReasoning(messages, maxHistoryReasoningTurns)` BEFORE the per-message transform loop. The helper walks `messages` and locates every assistant message; the most recent assistant message is always preserved (its reasoning is the most relevant context for the next turn); the older `assistantIndices.length - 1` historical messages are stripped in chronological order, keeping only the trailing `maxHistoryReasoningTurns - 1` of them intact.

`stripReasoningBlock` (exported from src/index.js) is a label-agnostic state machine that:

- Matches the canonical header `> ### ── <label> ──` (any label) as the entry signal.
- Consumes blockquote-prefixed body lines (`> *…*`, `> …`, or `>` for blanks).
- Exits on the first blank line (consuming it so the final response starts immediately with no leading gap).
- Returns the text byte-identical when no reasoning header is found.
- Only targets render styles that produce the blockquote shape (`markdown`, `quote`, `compact`); styles `details`, `raw`, and `strip` produce different output and are unaffected by the strip.

## 6. Compaction directive (v0.4.0)

When `compaction.stripReasoning === true`, the plugin registers an `experimental.session.compacting` hook that pushes a literal directive into `output.context`:

```
"Discard all reasoning blocks (sections starting with '> ### ──' and continuing until the
next blank line) before generating the compacted summary. Keep only the final response text."
```

OpenCode's compactor reads every string in `output.context` as guidance when generating the summary — this directive tells it to drop reasoning blocks before summarising, freeing context-window tokens for new turns.

The directive phrase (`"Discard all reasoning blocks"`) and the parenthetical block-shape description are asserted by a spec test in `test/compaction.test.js`.

## 7. Non-goals (MVP)

- No interactive collapse / expand of reasoning block in the TUI (use `style: "details"` for that).
- No theme integration (ANSI escapes are fixed; `markdown` / `quote` / `compact` rely on the TUI's blockquote rendering).
- No per-provider customization beyond `customTags` and `models`.
- No streaming transform in the OpenCode TUI integration (reasoning is rendered in full at message-complete time). The standalone streaming API (`/stream` subpath) parses token-by-token — that limitation only affects the TUI integration.

These are tracked as future enhancements, not bugs.
