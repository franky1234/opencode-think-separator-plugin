# Standalone usage guide

This guide covers the **non-OpenCode** surfaces of `opencode-think-separator-plugin`. The OpenCode TUI setup (the default `opencode-think-separator-plugin` subpath) is documented in [README.md](../README.md).

The package is plain ESM JavaScript with zero runtime dependencies, plus hand-authored TypeScript types. It runs anywhere that supports ES modules and `fetch` — Node.js ≥ 18, Deno, Bun, Vercel Edge, Cloudflare Workers, browsers.

## Table of contents

- [Prerequisites](#prerequisites)
- [Subpath map](#subpath-map)
- [Node.js backend / REST API](#nodejs-backend--rest-api)
- [Streaming SSE / WebSockets / Vercel AI SDK](#streaming-sse--websockets--vercel-ai-sdk)
- [React / Next.js frontend](#react--nextjs-frontend)
- [TypeScript](#typescript)

## Prerequisites

- Node.js ≥ 18 (engines field in `package.json`).
- ESM-aware bundler or runtime. `package.json` declares `"type": "module"`.
- TypeScript ≥ 5.6 only if you want the bundled `.d.ts` types checked by `tsc`. They are pure type annotations — there is no compile step or runtime cost.

Install via npm:

```bash
npm install opencode-think-separator-plugin
```

## Subpath map

Pick the narrowest subpath that fits your use case:

| Subpath                                  | Source       | Best for                                                                |
| ---------------------------------------- | ------------ | ----------------------------------------------------------------------- |
| `opencode-think-separator-plugin/core`   | `core.js`    | Anything that needs more than one primitive (REST API, React, scripts). |
| `opencode-think-separator-plugin/stream` | `stream.js`  | Streaming consumers (SSE, WebSocket, AI SDK). Synchronous factory.      |
| `opencode-think-separator-plugin/render` | `render.js`  | Render-only consumers (custom markdown pipelines, docs tooling).        |

> **Why three subpaths?** Each module is independently loadable, so a streaming service never pays the cost of loading the full OpenCode adapter, and a renderer never pays for the FSM parser. The `core` subpath re-exports all of them as a convenience.

---

## Node.js backend / REST API

Use `extractReasoningFromText` + `renderReasoning` for non-streaming responses (single-shot LLM calls, batch jobs, REST proxies).

### Example: Express handler

```js
// server.js
import express from "express"
import {extractReasoningFromText, renderReasoning, defaultConfig} from "opencode-think-separator-plugin/core"

const app = express()
app.use(express.json())

app.post("/v1/format", (req, res) => {
    const raw = String(req.body?.text ?? "")
    if (!raw) {
        return res.status(400).json({error: "Missing 'text' field"})
    }

    const {reasoningTexts, cleanText} = extractReasoningFromText(raw)
    const formatted =
        reasoningTexts
            .map((t) => renderReasoning(t, {label: "Thinking", style: "markdown"}))
            .join("\n") + cleanText

    res.json({formatted, reasoningCount: reasoningTexts.length})
})

app.listen(3000)
```

### Example: render with custom config

```js
import {
    extractReasoningFromText,
    renderReasoning,
    mergeConfig
} from "opencode-think-separator-plugin/core"

const userOptions = {label: "Deep Thinking", style: "details"}
const config = mergeConfig(userOptions) // {label, style}, never mutates defaults

const {reasoningTexts, cleanText} = extractReasoningFromText(raw)
const html = reasoningTexts
    .map((t) => renderReasoning(t, config))
    .join("\n") + cleanText
```

`mergeConfig` returns a fresh shallow copy on every call. Unknown keys (including unknown `style` values) silently fall back to defaults — safe to accept user input.

### Common pitfalls

- **Empty string input.** `extractReasoningFromText("")` returns `{reasoningTexts: [], cleanText: ""}`. The `cleanText` field is always a string (never `undefined`).
- **Unclosed tags.** A trailing `<think>…` with no closing tag is captured as a reasoning block — this matches the streaming parser's leniency. Callers that want strict pairing should call `extractReasoningFromText` twice and inspect the results.
- **Multiple reasoning blocks in one string.** The function returns them in source order — the index in `reasoningTexts` matches where each tag appeared. Iterate and render in order.
- **`renderReasoning` always appends `\n\n`.** Concatenating the result with the cleaned text is the canonical pattern shown above. Don't append your own trailing newlines — you'll end up with triple-spacing.

---

## Streaming SSE / WebSockets / Vercel AI SDK

Use the FSM parser from `/stream` when chunks arrive piece by piece and a `<think>` (or any whitelisted tag) might straddle a chunk boundary.

The parser is a **synchronous factory** that returns an independent state machine per call. State machine states are `CONTENT` and `REASONING`. Each `feed(chunk)` call returns zero or more `{type, text}` events; `flush()` emits any trailing buffered text at end-of-stream.

### Example: Express SSE endpoint reading a remote LLM

```js
// stream.js
import express from "express"
import {createReasoningStreamParser} from "opencode-think-separator-plugin/stream"

const app = express()

app.get("/v1/stream", async (req, res) => {
    res.setHeader("Content-Type", "text/event-stream")
    res.setHeader("Cache-Control", "no-cache")
    res.setHeader("Connection", "keep-alive")
    res.flushHeaders()

    const parser = createReasoningStreamParser()
    const upstream = await fetch("https://api.example.com/llm/stream", {
        headers: {Authorization: `Bearer ${process.env.LLM_API_KEY}`}
    })

    const reader = upstream.body.getReader()
    const decoder = new TextDecoder()

    try {
        while (true) {
            const {value, done} = await reader.read()
            if (done) break
            const chunk = decoder.decode(value, {stream: true})

            for (const event of parser.feed(chunk)) {
                // event.type is "reasoning" | "content"
                res.write(`event: ${event.type}\n`)
                res.write(`data: ${JSON.stringify({text: event.text})}\n\n`)
            }
        }

        // Don't forget flush() at end-of-stream — buffered text inherits
        // the current state (reasoning block if we ended mid-thought).
        for (const event of parser.flush()) {
            res.write(`event: ${event.type}\n`)
            res.write(`data: ${JSON.stringify({text: event.text})}\n\n`)
        }
    } catch (err) {
        res.write(`event: error\ndata: ${JSON.stringify({message: err.message})}\n\n`)
    } finally {
        res.end()
    }
})
```

### Example: Vercel AI SDK

```js
import {streamText} from "ai"
import {openai} from "@ai-sdk/openai"
import {createReasoningStreamParser} from "opencode-think-separator-plugin/stream"

export async function POST(req) {
    const {prompt} = await req.json()
    const parser = createReasoningStreamParser()

    const result = streamText({
        model: openai("o3-mini"),
        prompt
    })

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
        async start(controller) {
            try {
                for await (const chunk of result.textStream) {
                    for (const event of parser.feed(chunk)) {
                        controller.enqueue(
                            encoder.encode(
                                `event: ${event.type}\n` +
                                `data: ${JSON.stringify({text: event.text})}\n\n`
                            )
                        )
                    }
                }

                for (const event of parser.flush()) {
                    controller.enqueue(
                        encoder.encode(
                            `event: ${event.type}\n` +
                            `data: ${JSON.stringify({text: event.text})}\n\n`
                        )
                    )
                }
            } finally {
                controller.close()
            }
        }
    })

    return new Response(stream, {
        headers: {"Content-Type": "text/event-stream"}
    })
}
```

### Example: abort handling

```js
import {createReasoningStreamParser} from "opencode-think-separator-plugin/stream"

const parser = createReasoningStreamParser()
const ac = new AbortController()

req.on("close", () => ac.abort())

try {
    const upstream = await fetch(url, {signal: ac.signal})
    // ...iterate reader, feed parser, write events...
} catch (err) {
    if (err.name === "AbortError") {
        // Client disconnected. The parser instance can be safely discarded;
        // its state is local to this closure.
        return
    }
    throw err
}
```

### Common pitfalls

- **Forgetting `flush()`.** Without it, any text buffered at end-of-stream is lost. If the stream ends mid-reasoning-block, that reasoning is silently dropped. Always call `flush()` in the cleanup path.
- **Importing from `/core` for streaming.** `core.createReasoningStreamParser` is an **async** wrapper (lazy module resolution for tree-shaking). It works, but every call awaits a Promise. For streaming consumers, import from `/stream` to get the synchronous factory.
- **Sharing one parser across requests.** Each `createReasoningStreamParser()` call returns an **independent** FSM instance. Do not reuse a parser across concurrent streams — its internal buffer is shared mutable state. Create one parser per stream.
- **Non-string chunks.** The parser ignores non-string or empty chunks without throwing. `feed(undefined)`, `feed(null)`, `feed("")` all return `[]`. Don't pre-filter upstream — let the parser handle it.
- **Custom tag whitelist.** Pass `{tagNames: ["myCustomTag"]}` to override the default whitelist (e.g. for a provider that uses `<scratchpad>`). The whitelist is matched **case-insensitively**.
- **Lenient close-tag matching.** Unlike `extractReasoningFromText` (which enforces paired open/close), the FSM closes on **any** whitelisted closing tag. This is intentional — at chunk boundaries you rarely know which opener started the block. Callers that need strict pairing should run `extractReasoningFromText` on the assembled text after the stream ends.

---

## React / Next.js frontend

Use `extractReasoningFromText` in a `useMemo` so parsing only runs when the raw message changes. Render the reasoning list with semantic HTML and accessible collapsibles.

### Example: Chat message component

```tsx
// ChatMessage.tsx
import {useMemo} from "react"
import ReactMarkdown from "react-markdown"
import {extractReasoningFromText} from "opencode-think-separator-plugin/core"

interface ChatMessageProps {
    rawMessage: string
    /** Optional override for the reasoning summary label. */
    reasoningLabel?: string
}

export function ChatMessage({rawMessage, reasoningLabel = "Reasoning"}: ChatMessageProps) {
    const {reasoningTexts, cleanText} = useMemo(
        () => extractReasoningFromText(rawMessage),
        [rawMessage]
    )

    return (
        <article className="chat-bubble space-y-3" aria-label="Chat message">
            {reasoningTexts.map((thought, idx) => {
                const lineCount = thought.split("\n").length
                const summaryId = `reasoning-summary-${idx}`
                const contentId = `reasoning-content-${idx}`
                return (
                    <details
                        key={idx}
                        className="rounded border border-neutral-800 bg-neutral-900 p-3 text-sm"
                    >
                        <summary
                            id={summaryId}
                            aria-controls={contentId}
                            className="cursor-pointer font-medium text-neutral-400 select-none"
                        >
                            {reasoningLabel} ({lineCount} {lineCount === 1 ? "step" : "steps"})
                        </summary>
                        <div
                            id={contentId}
                            role="region"
                            aria-labelledby={summaryId}
                            className="mt-2 whitespace-pre-wrap italic text-neutral-300 pl-2 border-l-2 border-neutral-700"
                        >
                            {thought}
                        </div>
                    </details>
                )
            })}
            <div className="prose prose-invert">
                <ReactMarkdown>{cleanText}</ReactMarkdown>
            </div>
        </article>
    )
}
```

### Example: rendering with the `details` style

If you want the plugin to produce the HTML for you (and escape `<`/`>`/`&`/`"`/`'` automatically), use the `details` style from `/render`:

```tsx
import {renderReasoning} from "opencode-think-separator-plugin/render"

const html = renderReasoning(rawReasoning, {label: "Thinking", style: "details"})
// <details><summary>Thinking</summary>\n\n…escaped body…\n\n</details>\n\n
```

Render `html` with `dangerouslySetInnerHTML` only after sanitisation. The body is escaped at the source by the plugin, but you should still sanitise the surrounding document.

### Common pitfalls

- **Parsing on every render.** Wrap `extractReasoningFromText` in `useMemo` keyed on the raw message — the function does a regex pass and you don't want it running on every keystroke.
- **Re-using the same `<details>` element across rerenders.** React preserves `open` state per-element. If you want a "collapsed by default" reasoning, set `open={false}` explicitly, or use `<details open={idx === 0}>` to expand the first block only.
- **XSS via reasoning text.** The plugin's `details` style HTML-escapes the body, but if you render reasoning in JSX directly (`<div>{thought}</div>`), JSX escapes for you anyway. Don't use `dangerouslySetInnerHTML` on reasoning text without sanitising — the content is model output and may contain anything.
- **Streaming in the browser.** The streaming parser (`/stream`) works in browsers and edge runtimes, but it expects raw token chunks. If you're displaying a Vercel AI SDK stream from a server component, do the parsing server-side and pass the structured result to the client component as a prop.
- **Accessibility.** `<details>`/`<summary>` is keyboard-accessible by default, but the rendered reasoning inside should still be wrapped in something with `role="region"` and `aria-labelledby` pointing to the summary (as in the example above).

---

## TypeScript

The package ships `types/index.d.ts` — pure type annotations, no compile step. Import types alongside or separately from the runtime values.

### Importing types

```ts
import {
    extractReasoningFromText,
    renderReasoning,
    mergeConfig,
    type DetectionResult,
    type ExtractedReasoning,
    type PluginConfig,
    type UserConfig,
    type RenderOptions,
    type RenderStyle,
    type StreamChunkResult,
    type ReasoningStreamParser,
    type CreateReasoningStreamParser
} from "opencode-think-separator-plugin"
```

The `type` keyword is optional in modern TS — `import type {…}` also works and is preferred when you only need types (tree-shakable).

### Narrowing discriminated unions

`StreamChunkResult` is a discriminated union over `type`:

```ts
import type {StreamChunkResult} from "opencode-think-separator-plugin"

function describe(event: StreamChunkResult): string {
    switch (event.type) {
        case "reasoning":
            // event.text is string here, type is "reasoning"
            return `reasoning (${event.text.length} chars)`
        case "content":
            // event.text is string here, type is "content"
            return `content (${event.text.length} chars)`
    }
}
```

### Constraining user config with generic helpers

```ts
import type {UserConfig, PluginConfig} from "opencode-think-separator-plugin"
import {mergeConfig} from "opencode-think-separator-plugin/core"

function buildConfig(input: Partial<UserConfig>): PluginConfig {
    // mergeConfig guarantees a fully-populated PluginConfig,
    // never returns UserConfig (all keys become required).
    return mergeConfig(input)
}

// Helper that narrows the user-facing style to a known RenderStyle.
function isRenderStyle(value: unknown): value is RenderStyle {
    return value === "markdown" || value === "details" || value === "strip" || value === "raw"
}
```

### Typing your own wrapper around the streaming parser

```ts
import {createReasoningStreamParser} from "opencode-think-separator-plugin/stream"
import type {ReasoningStreamParser, StreamChunkResult} from "opencode-think-separator-plugin"

export class StreamAccumulator {
    private parser: ReasoningStreamParser = createReasoningStreamParser()

    feed(chunk: string): StreamChunkResult[] {
        return this.parser.feed(chunk)
    }

    end(): StreamChunkResult[] {
        return this.parser.flush()
    }

    state(): string {
        return this.parser.getState()
    }
}
```

### Common pitfalls

- **`createReasoningStreamParser` from `/core` is async.** The function signature is `async (options?) => Promise<ReasoningStreamParser>`. If you type a wrapper as `(options?) => ReasoningStreamParser` and call `core`'s version, you'll get a Promise, not the parser. Import from `/stream` for the sync factory.
- **`PluginConfig` vs `UserConfig`.** `PluginConfig` is what `mergeConfig` returns — both `label` and `style` are required. `UserConfig` is what consumers pass in — both keys are optional. Don't write `PluginConfig` as the parameter type of a function that accepts user input.
- **`RenderStyle` is a string-literal union.** Style values (`"markdown"` | `"details"` | `"strip"` | `"raw"`) are case-sensitive — `"details"` is valid, `"DETAILS"` is not. The plugin does NOT normalise these values; both `mergeConfig` and `renderReasoning` match them exactly. Unknown values silently fall back to `"markdown"` (forward-compat), so a typo falls back rather than throwing. If you accept user-provided style values, normalise and validate them yourself before passing them in (e.g. `String(raw).toLowerCase()` and a check against `["markdown", "details", "strip", "raw"]`).
- **`RenderOptions` has optional `label` and `style`.** `renderReasoning(text, undefined)` and `renderReasoning(text, {})` are both valid; both fall back to `{label: "Reasoning", style: "markdown"}`. The legacy `renderReasoning(text, "My Label")` form is still supported (string is treated as the label).
- **`DetectionResult.kind` is `"block" | "text_tag" | "field"`.** These mirror the three detection strategies inside `src/detect-reasoning.js`. Exhaustive switches with `never` should treat these as the closed set.

---

See [README.md](../README.md) for the TL;DR and OpenCode TUI setup.