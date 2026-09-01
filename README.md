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

| Knob    | Type      | Default     | Description                                                                                            |
| ------- | --------- | ----------- | ------------------------------------------------------------------------------------------------------ |
| `label` | `string`  | `"Reasoning"` | Header label shown above the reasoning block.                                                          |
| `style` | `string`  | `"markdown"` | Render strategy. One of `"markdown"` \| `"details"` \| `"strip"` \| `"raw"`. Forward-compat — see below. |

Style values and what each one produces:

| Value      | Output                                                                                  |
| ---------- | --------------------------------------------------------------------------------------- |
| `markdown` | GFM blockquote with italic body and `### ── Label ──` header. Default.                  |
| `details`  | HTML `<details><summary>…</summary>…</details>` collapsible block (label + body escaped). |
| `strip`    | Drops the reasoning block entirely — the final response stands alone.                    |
| `raw`      | Pass-through of the raw reasoning text with no decoration.                               |

> **OpenCode TUI adapter note.** The OpenCode plugin adapter currently applies the `markdown` style only. The `style` knob is accepted for forward compatibility and is consumed by the standalone `renderReasoning(text, {label, style})` API documented below. A future release will wire the knob through to the TUI adapter.

Unknown keys in the options are silently ignored (forward-compat). Unknown `style` values silently fall back to `"markdown"`.

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

| opencode version | Status                     |
| ---------------- | -------------------------- |
| 1.18.18          | ✓ verified                 |
| 1.15 – 1.17      | untested, expected to work |

See [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) for the full matrix and expansion plan.

## Known limitations (v0.2.0)

- **OpenCode TUI adapter renders at message-complete time**, not during streaming. The standalone streaming API (`/stream` subpath) **does** parse token-by-token — that limitation only affects the OpenCode TUI integration.
- **The OpenCode TUI adapter currently applies only the default `markdown` style.** The `style` config knob is accepted for forward-compat and consumed by the standalone `renderReasoning` API. Wiring the knob into the adapter is on the roadmap.
- **Fixtures are synthetic**, not captured from real provider responses. They will be replaced before v1.0.0 — see [test/fixtures/README.md](test/fixtures/README.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).