# opencode-think-separator-plugin

An opencode TUI plugin that visually separates the model's reasoning block from its final response.

Provider-agnostic — works with Anthropic (Claude), OpenAI (o3, o1), Google (Gemini 2.5 Pro), and MiniMax (M3). Zero runtime dependencies. Opencode-version-agnostic ≥ 1.15.

## Install

### Recommended: edit `~/.config/opencode/opencode.json`

Add the plugin to your existing config:

```json
{
    "plugin": ["opencode-think-separator-plugin"]
}
```

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

## How it works

When the LLM produces a response that includes reasoning (chain-of-thought, extended thinking, internal monologue), opencode emits it as a separate `type: "reasoning"` part or inside embedded tags like `<think>...</think>`. This plugin intercepts the message stream and rewrites each reasoning section into a formatted block prefixed with a visual separator:

```markdown
> ### ── Reasoning ──
> *The model thinks step by step here...*

This is the final, visible response.
```

Reasoning appears inside an italicized blockquote with a styled header, followed by a blank line before the final response.

The detection layer covers:

- **Native reasoning/thinking parts**: Anthropic, MiniMax, OpenAI, Google.
- **Embedded XML reasoning tags in text**: `<think>`, `<thought>`, `<antThinking>`, `<reasoning>`, `<thought_process>`, `<chain_of_thought>` (e.g. MiniMax, DeepSeek-R1, Qwen, Ollama).
- **Non-standard top-level fields** (`reasoning_content`, `thoughts`) as defense-in-depth.

For full architecture details see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Configuration

Default config:

```json
{
    "label": "Reasoning",
    "style": "markdown"
}
```

Override knobs by passing options to the plugin in `opencode.json`:

```json
{
    "plugin": [
        [
            "opencode-think-separator-plugin",
            {"label": "Deep Thinking", "style": "details"}
        ]
    ]
}
```

Available knobs:

| Knob                         | Type      | Default        | Description                                                                                                                                                              |
| ---------------------------- | --------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `label`                      | `string`  | `"Reasoning"`  | Header label shown above the reasoning block.                                                                                                                            |
| `style`                      | `string`  | `"markdown"`   | Render strategy. One of `markdown` \| `details` \| `strip` \| `raw` \| `quote` \| `compact` \| `markdown-rendered`. All seven styles are wired through to the OpenCode TUI adapter (v0.4.0+).       |
| `maxLines`                   | `number`  | (unset)        | Optional positive integer. When the reasoning text exceeds `maxLines` lines, the renderer drops the tail and appends a `[+N lines of reasoning truncated]` indicator.    |
| `models`                     | `object`  | (unset)        | Per-model override map. Each entry maps a model id (exact, or a `prefix/*` wildcard) to `{label?, style?, maxLines?}`. First match wins.                                |
| `customTags`                 | `string[]`| (unset)        | Extra XML tag names the detector should recognise in addition to its built-in defaults (`think`, `thought`, `thoughts`, `reasoning`, `antThinking`, `thought_process`, `chain_of_thought`, `internal_thought`). |
| `compaction`                 | `object`  | (unset)        | Context-window protection. Currently supports `{stripReasoning: true}` — registers an `experimental.session.compacting` hook that asks the compactor to discard reasoning blocks. |
| `stripHistory`               | `boolean` | `false`        | When `true`, the plugin drops the rendered reasoning block from **historical** assistant messages before each turn (keeps the most recent `maxHistoryReasoningTurns - 1` historical turns intact). |
| `maxHistoryReasoningTurns`   | `number`  | `1`            | Number of recent assistant turns (including the current one) that keep their rendered reasoning when `stripHistory` is on. `1` keeps only the current turn; `2` keeps current + 1 historical. |

### Style values and what each one produces

| Value                | Output                                                                                                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `markdown`           | GFM blockquote with italic body and `### ── Label ──` header. Default. (Metadata badge like `(~1.2s, 450 tokens)` is appended to the header when supplied.) |
| `details`            | HTML `<details><summary>…</summary>…</details>` collapsible block (label + body escaped).                                                          |
| `strip`              | Drops the reasoning block entirely — the final response stands alone.                                                                                |
| `raw`                | Pass-through of the raw reasoning text with no decoration.                                                                                         |
| `quote`              | Same blockquote shape as `markdown` but WITHOUT italic asterisk wrapping — plain `> line` prefix. Useful for terminals that render italic weakly. |
| `compact`            | One-line header with a `(N lines)` badge + first-line preview, plus a `> *…*` indicator that more lines were elided.                             |
| `markdown-rendered`  | A real `### ── Label ──` heading (no `> ` prefix) followed by the raw reasoning text — the TUI's markdown renderer handles inner formatting (italics, headers, numbered lists, code fences) verbatim. Opt-in alternative to `markdown` when you want inner reasoning structure to actually render. |

Unknown keys in the options are silently ignored (forward-compat). Unknown `style` values silently fall back to `"markdown"`.

### Style comparison matrix

Pick a render style at a glance. Each row links to a copy-pasteable `opencode.*.json` snippet under `examples/` (or to an inline snippet for the three styles that don't have a dedicated file — `details`, `raw`, `strip`).

| `style`               | One-line description                                                                                                              | Example                                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `markdown` (default)  | GFM blockquote with italic body and `### ── Label ──` header.                                                                     | Use the default — no explicit option needed.                                                                   |
| `markdown-rendered`   | Real `### ── Label ──` heading (no `> ` prefix) + raw body; inner formatting (italics, lists, code fences) renders verbatim.      | [`examples/opencode.markdown-rendered.json`](examples/opencode.markdown-rendered.json)                         |
| `quote`               | Same blockquote shape as `markdown` but WITHOUT italic wrapping — plain `> line` prefix. Better in terminals with weak italics.  | [`examples/opencode.quote.json`](examples/opencode.quote.json)                                                 |
| `compact`             | One-line header with `(N lines)` badge + first-line preview; collapses long reasoning traces.                                     | [`examples/opencode.compact.json`](examples/opencode.compact.json)                                             |
| `details`             | HTML `<details><summary>…</summary>…</details>` collapsible block.                                                               | See inline snippet below.                                                                                      |
| `raw`                 | Pass-through of the raw reasoning text with no decoration.                                                                        | See inline snippet below.                                                                                      |
| `strip`               | Drops the reasoning block entirely — the final response stands alone.                                                            | See inline snippet below.                                                                                      |

For `details`, `raw`, and `strip` (no dedicated example file — the snippet is small enough to inline):

##### `opencode.details.json` — collapsible HTML block

```json
{
    "plugin": [
        [
            "opencode-think-separator-plugin",
            {"label": "Reasoning", "style": "details"}
        ]
    ]
}
```

##### `opencode.raw.json` — pass-through with no decoration

```json
{
    "plugin": [
        [
            "opencode-think-separator-plugin",
            {"label": "Reasoning", "style": "raw"}
        ]
    ]
}
```

##### `opencode.strip.json` — drops the reasoning block entirely

```json
{
    "plugin": [
        [
            "opencode-think-separator-plugin",
            {"label": "Reasoning", "style": "strip"}
        ]
    ]
}
```

### Configuration scenarios

Beyond the render style, two common configuration scenarios are covered by dedicated example files:

- **Context-window protection** — [`examples/opencode.context-window.json`](examples/opencode.context-window.json) enables `compaction.stripReasoning` (registers the `experimental.session.compacting` hook that asks the compactor to discard reasoning blocks) plus `stripHistory: true` with `maxHistoryReasoningTurns: 2` (keeps the current turn plus one historical turn; older turns are stripped).
- **Per-model overrides** — [`examples/opencode.per-model.json`](examples/opencode.per-model.json) routes four model ids to different render styles via the `models` map (`anthropic/claude-3.7-sonnet` → `details`, `openai/o3-mini` → `compact`, `deepseek/deepseek-r1` → `raw`, `google/gemini-2.5-pro` → default `markdown` with a renamed label). Patterns are matched exactly unless they end in `/*` (prefix wildcard); first match wins.

### Examples

Compact view for long reasoning traces:

```json
{
    "plugin": [
        [
            "opencode-think-separator-plugin",
            {"style": "compact", "maxLines": 10}
        ]
    ]
}
```

Clean blockquote without italics:

```json
{
    "plugin": [
        [
            "opencode-think-separator-plugin",
            {"style": "quote"}
        ]
    ]
}
```

Context-window protection for long sessions:

```json
{
    "plugin": [
        [
            "opencode-think-separator-plugin",
            {
                "compaction": {"stripReasoning": true},
                "stripHistory": true,
                "maxHistoryReasoningTurns": 2
            }
        ]
    ]
}
```

Per-model overrides (DeepSeek gets a compact badge, OpenAI gets the default markdown style):

```json
{
    "plugin": [
        [
            "opencode-think-separator-plugin",
            {
                "models": {
                    "deepseek/*": {"style": "compact", "maxLines": 8},
                    "openai/o3-mini": {"label": "Reasoning"}
                }
            }
        ]
    ]
}
```

### How XML reasoning detection handles code

The detector masks fenced and inline code spans (using a `\x00`-bounded sentinel) **before** running its 3-phase regex pipeline, then restores the original snippets verbatim. This means `<think>` markup that appears inside a markdown code block (e.g. documentation teaching the user about the plugin) cannot trigger a false-positive reasoning extraction. The `<think>`, `<thought>`, `<antThinking>`, etc. anchors are also line-anchored: mid-sentence mentions of `<think>` like `"Note: <think> tags are used for reasoning."` are preserved verbatim rather than being silently swallowed. See `src/detect-reasoning.js` (`maskCodeSpans` + `compileReasoningTagRegex`) for the implementation.

## Subpath exports

The package exposes four entry points. Pick the one that matches your consumer:

| Subpath                                 | Source module      | Use it for                                                                                |
| --------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------- |
| `opencode-think-separator-plugin`       | `src/index.js`     | OpenCode TUI plugin (default export = `{id, server}`). Do **not** import directly.        |
| `opencode-think-separator-plugin/core`  | `src/core.js`      | Pure, framework-agnostic API gateway. Re-exports everything below.                        |
| `opencode-think-separator-plugin/stream`| `src/stream.js`    | Streaming FSM parser (`createReasoningStreamParser`). Use for SSE / WebSocket / AI SDK.    |
| `opencode-think-separator-plugin/render`| `src/render.js`    | Rendering primitives (`renderReasoning`, `RENDER_STYLES`, `compose`).                     |

Quick example using the core gateway:

```js
import {
    extractReasoningFromText,
    renderReasoning,
    mergeConfig,
    createReasoningStreamParser
} from "opencode-think-separator-plugin/core"
```

For the full multi-platform guide (Node.js REST API, streaming SSE, React/Next.js, TypeScript), see [docs/STANDALONE_USAGE.md](docs/STANDALONE_USAGE.md).

## Standalone usage (TL;DR)

The core API is framework-agnostic — you can drop it into any Node.js, browser, or edge runtime that speaks ES modules. Below is a one-liner for each platform; full guides live in [docs/STANDALONE_USAGE.md](docs/STANDALONE_USAGE.md).

### Node.js backend / REST API

```js
import {extractReasoningFromText, renderReasoning} from "opencode-think-separator-plugin/core"

const {reasoningTexts, cleanText} = extractReasoningFromText(rawLLMOutput)
const formatted =
    reasoningTexts
        .map((t) => renderReasoning(t, {label: "Thinking", style: "markdown"}))
        .join("\n") + cleanText
```

### Streaming (SSE / WebSocket / Vercel AI SDK)

```js
import {createReasoningStreamParser} from "opencode-think-separator-plugin/stream"

const parser = createReasoningStreamParser() // sync factory, independent FSM instance

for await (const chunk of tokenStream) {
    for (const event of parser.feed(chunk)) {
        if (event.type === "reasoning") {
            res.write(`data: ${JSON.stringify({reasoning: event.text})}\n\n`)
        } else {
            res.write(`data: ${JSON.stringify({content: event.text})}\n\n`)
        }
    }
}

for (const event of parser.flush()) {
    res.write(`data: ${JSON.stringify({[event.type]: event.text})}\n\n`)
}
```

> Import from `/stream` for the sync factory. Importing from `/core` gives you an async wrapper (lazy module resolution); both work, but `/stream` is the simpler API for streaming consumers.

### React / Next.js frontend

```tsx
import {useMemo} from "react"
import ReactMarkdown from "react-markdown"
import {extractReasoningFromText} from "opencode-think-separator-plugin/core"

export const ChatMessage = ({rawMessage}: {rawMessage: string}) => {
    const {reasoningTexts, cleanText} = useMemo(
        () => extractReasoningFromText(rawMessage),
        [rawMessage]
    )

    return (
        <div className="chat-bubble space-y-3">
            {reasoningTexts.map((thought, idx) => (
                <details key={idx} className="rounded border p-3 text-sm">
                    <summary className="cursor-pointer font-medium select-none">
                        Reasoning ({thought.split("\n").length} steps)
                    </summary>
                    <div className="mt-2 whitespace-pre-wrap italic pl-2 border-l-2">
                        {thought}
                    </div>
                </details>
            ))}
            <div className="prose">
                <ReactMarkdown>{cleanText}</ReactMarkdown>
            </div>
        </div>
    )
}
```

## TypeScript

The package ships hand-authored type definitions at `types/index.d.ts`. There is no compile-step: `tsc --noEmit` validates the public API surface; consumers get types straight from the package.

```ts
import type {
    DetectionResult,
    ExtractedReasoning,
    PluginConfig,
    RenderOptions,
    RenderStyle,
    StreamChunkResult,
    UserConfig,
    ReasoningStreamParser
} from "opencode-think-separator-plugin"

// PluginConfig is the resolved, frozen config (label + style).
// UserConfig is what consumers pass in (both keys optional).
function buildConfig(input: UserConfig): PluginConfig {
    // ...
}

// Narrowing the discriminated union returned by the stream parser.
function handle(event: StreamChunkResult) {
    if (event.type === "reasoning") {
        console.log("reasoning:", event.text)
    } else {
        console.log("content:", event.text)
    }
}

// Use RenderOptions to type the polymorphic second arg of renderReasoning.
const opts: RenderOptions = {label: "Thinking", style: "details"}
```

The full TypeScript reference (with narrowing examples and generic constraints) is in [docs/STANDALONE_USAGE.md § TypeScript](docs/STANDALONE_USAGE.md#typescript).

## Compatibility

| opencode version | Status                       | Notes                                                                                               |
| ---------------- | ---------------------------- | --------------------------------------------------------------------------------------------------- |
| 1.18.32          | ✓ verified                   | Baseline for v0.4.0 — both `experimental.chat.messages.transform` and `experimental.session.compacting` hooks fire. |
| 1.18.18          | ✓ verified                   | Earlier v0.3.0 baseline. `experimental.session.compacting` not exercised (hook is v0.4.0+).         |
| 1.15 – 1.17      | untested, expected to work   | Plugin contract is hook-only; the v0.4.0 features degrade gracefully when hooks are missing.        |

See [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) for the full matrix and expansion plan.

## Known limitations (v0.4.0)

- **OpenCode TUI adapter renders at message-complete time**, not during streaming. The standalone streaming API (`/stream` subpath) **does** parse token-by-token — that limitation only affects the OpenCode TUI integration.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Development

Biome handles linting (`biome.json`); Prettier handles formatting (`prettier.config.js`). The split keeps each tool focused on its strength: Biome catches bugs (e.g. `noExplicitAny` style for the JSDoc/TS surface); Prettier applies consistent whitespace. To run both gates: `npm run check:fix`.

## License

MIT — see [LICENSE](LICENSE).