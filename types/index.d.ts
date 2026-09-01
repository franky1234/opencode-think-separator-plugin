/**
 * Public type surface for opencode-think-separator-plugin v0.3.0+.
 *
 * This file is hand-authored. TypeScript's `noEmit` flag suppresses declaration
 * emit (see tsconfig.json), so the shapes below are the canonical API contract
 * for downstream TypeScript consumers.
 *
 * Implementation lives in plain ESM JavaScript under src/. Source files already
 * carry matching JSDoc `@typedef` blocks; this file mirrors and extends them.
 */

/**
 * Discriminator for rendering strategies applied to extracted reasoning.
 *
 * - `markdown`: Blockquoted italic lines wrapped in a `###` heading
 *   (current v0.2.0 default — see src/render.js).
 * - `details`: HTML `<details><summary>` collapsible block.
 * - `strip`: Removes reasoning entirely; the final response stands alone.
 * - `raw`: Returns the reasoning text unmodified.
 */
export type RenderStyle = "markdown" | "details" | "strip" | "raw";

/**
 * Options accepted by `renderReasoning` (and related render functions) when
 * callers want to override the plugin-level config (label, style).
 */
export interface RenderOptions {
    /** Header label shown above the reasoning block. */
    label?: string;
    /** Rendering strategy to apply. */
    style?: RenderStyle;
}

/**
 * A single message part as carried by OpenCode (and emitted by Anthropic /
 * OpenAI / Google / MiniMax providers).
 *
 * OpenCode normalizes most providers to `{type: "reasoning" | "text" | ...}`
 * parts internally. This interface covers both that shape and the raw
 * provider shapes the plugin encounters during defense-in-depth detection.
 */
export interface MessagePart {
    type: string;
    text?: string;
    /** Anthropic / MiniMax thinking blocks: `thinking` or `redacted_thinking`. */
    thinking?: string;
    /** Anthropic / MiniMax thinking blocks: `redacted_thinking` payload. */
    redacted_thinking?: string;
    /** Tool / image / file / result envelopes (passed through untouched). */
    [extra: string]: unknown;
}

/**
 * The assistant message object OpenCode hands to the plugin's
 * `experimental.chat.messages.transform` hook.
 *
 * Top-level fields like `reasoning_content`, `thoughts`, `cot`, etc. are
 * listed explicitly to mirror the defense-in-depth detector in
 * src/detect-reasoning.js (REASONING_FIELDS whitelist).
 */
export interface OpenCodeMessage {
    parts: MessagePart[];
    info?: {
        role: string;
        [extra: string]: unknown;
    };
    /** Anthropic / OpenAI / Google / MiniMax reasoning field names (whitelisted). */
    thinking?: string;
    reasoning?: string;
    reasoning_content?: string;
    reasoning_text?: string;
    redacted_thinking?: string;
    thoughts?: string;
    cot?: string;
    chain_of_thought?: string;
    internal_monologue?: string;
    reflection?: string;
    /** Raw provider payload (Anthropic content[], raw string content, etc.). */
    content?: MessagePart[] | string;
    [extra: string]: unknown;
}

/**
 * Frozen plugin configuration after `mergeConfig` resolves user overrides.
 * Returned as a fresh shallow copy on every call.
 */
export interface PluginConfig {
    /** Header label shown above the reasoning block. */
    label: string;
}

/**
 * User-supplied overrides passed via OpenCode plugin options. Unknown keys
 * are intentionally ignored by `mergeConfig` so older configs keep working.
 */
export interface UserConfig {
    /** Optional label override. Falls back to `defaultConfig.label` when omitted. */
    label?: string;
}

/**
 * Result of running `detectReasoning` on a message.
 *
 * `null` is returned when the message is invalid or no detection strategy
 * matches.
 */
export interface DetectionResult {
    /** The extracted reasoning text. */
    reasoning: string;
    /** Which provider field / block / tag the reasoning came from. */
    source: string;
    /** Classification of how the reasoning was found. */
    kind: "block" | "text_tag" | "field";
}

/**
 * Result of `extractReasoningFromText` — the input string with XML reasoning
 * tags removed and the captured reasoning blocks returned separately.
 */
export interface ExtractedReasoning {
    /** Reasoning blocks found inside XML tags, in source order. */
    reasoningTexts: string[];
    /** Input text with reasoning tags removed. */
    cleanText: string;
}

/**
 * One event emitted by `ReasoningStreamParser.feed()` (or `.flush()`) as it
 * tokenizes a chunked reasoning stream.
 *
 * Used by SSE / WebSocket / Vercel AI SDK consumers that need to forward
 * reasoning and content as separate streams (see docs/STANDALONE_USAGE.md).
 */
export interface StreamChunkResult {
    /** Discriminates whether `text` is reasoning or final content. */
    type: "reasoning" | "content";
    /** The chunk of text for this event. */
    text: string;
}

/**
 * Factory contract for the streaming parser (Phase 4 of the v2 upgrade).
 *
 * The parser is a small finite-state machine that buffers partial tags
 * across chunk boundaries (the "split-token problem"). Each call returns
 * a fresh, isolated instance — no shared state between parsers.
 */
export interface ReasoningStreamParser {
    /** Feed a chunk of token-stream text; returns zero or more events. */
    feed(chunk: string): StreamChunkResult[];
    /** Flush any buffered state at end-of-stream; returns trailing events. */
    flush(): StreamChunkResult[];
    /** Read the current FSM state name (for debugging / observability). */
    getState(): string;
}

/**
 * Factory entry-point signature. Implemented in src/stream.js (Phase 4).
 */
export type CreateReasoningStreamParser = (options?: Record<string, unknown>) => ReasoningStreamParser;