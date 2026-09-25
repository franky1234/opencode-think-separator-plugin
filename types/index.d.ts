/**
 * Public type surface for opencode-think-separator-plugin v0.4.0+.
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
 * - `quote`: Same shape as `markdown` but WITHOUT italic asterisk wrapping —
 *   plain `> ${line}` blockquote. Useful for terminals that render italic weakly.
 * - `compact`: One-line header with line-count badge + first-line preview
 *   (plus a `*...*` indicator that more lines were elided).
 */
export type RenderStyle =
    | "markdown"
    | "details"
    | "strip"
    | "raw"
    | "quote"
    | "compact";

/**
 * Options accepted by `renderReasoning` (and related render functions) when
 * callers want to override the plugin-level config (label, style, metadata).
 *
 * `metadata` is forwarded to the renderer so the header can show a duration
 * / token badge. Only the `markdown` renderer currently surfaces it.
 */
export interface RenderOptions {
    /** Header label shown above the reasoning block. */
    label?: string;
    /** Rendering strategy to apply. */
    style?: RenderStyle;
    /**
     * Optional reasoning metadata for header badges (e.g. duration, tokens).
     * Forwarded to the chosen renderer; only `markdown` currently renders a
     * badge from it. All fields are optional and silently ignored if absent.
     */
    metadata?: ReasoningMetadata;
    /**
     * Optional maximum number of lines to retain before rendering. When the
     * input has more lines, the renderer drops the tail and appends an italic
     * elision indicator. Must be a positive integer; non-positive / non-integer
     * values are silently ignored. Applies to every render style.
     */
    maxLines?: number;
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
 * Per-model override payload. All fields are optional; an absent field
 * falls back to the value inherited from the base config when resolved via
 * `resolveModelConfig`.
 *
 * - `style`: render-style override (validated against `RenderStyle`).
 * - `label`: header-label override (any non-empty string is accepted).
 * - `maxLines`: per-model truncation limit override (must be a positive integer).
 */
export interface ModelConfigOverride {
    /** Render-style override applied when the model pattern matches. */
    style?: RenderStyle;
    /** Header-label override applied when the model pattern matches. */
    label?: string;
    /** Per-model maxLines override; must be a positive integer to take effect. */
    maxLines?: number;
}

/**
 * Glob pattern used to match a model id. Two forms are supported:
 *
 * - **Exact**: `"deepseek/v4-pro"` matches only the exact id.
 * - **Prefix wildcard**: ends in `/*` (e.g. `"deepseek/*"`); matches every
 *   id that starts with the prefix followed by `/`. Patterns with `*` in
 *   any other position fall back to exact-equality matching (the parser
 *   stays total and crash-free).
 *
 * Iteration is insertion order; first match wins.
 */
export type ModelOverridePattern = string;

/**
 * Map of model-id patterns to per-model overrides. Used by
 * `resolveModelConfig(modelId, baseConfig)` to look up the effective
 * `{label, style}` for the current message's model.
 *
 * Indexed by `ModelOverridePattern` (string) so users can supply arbitrary
 * pattern keys; runtime validation in `patternMatches` decides whether a
 * pattern is exact or prefix-wildcard.
 */
export type ModelConfigMap = Readonly<Record<string, ModelConfigOverride>>;

/**
 * Context-window protection settings forwarded to OpenCode's session
 * compactor. Only one knob is exposed in v0.4.0 — `stripReasoning` — which
 * registers an `experimental.session.compacting` hook asking the compactor
 * to drop rendered reasoning blocks from the compacted summary.
 */
export interface CompactionConfig {
    /**
     * When true, register an `experimental.session.compacting` hook that
     * pushes a directive into `output.context` instructing OpenCode's
     * compactor to discard reasoning blocks (`> ### ── ... ──` headers +
     * their blockquote bodies) before generating the compacted summary.
     * Default: `false` (no compaction hook is registered).
     */
    stripReasoning?: boolean;
}

/**
 * Frozen plugin configuration after `mergeConfig` resolves user overrides.
 * Returned as a fresh shallow copy on every call.
 *
 * `models`, `customTags`, `maxLines`, `compaction`, `stripHistory`, and
 * `maxHistoryReasoningTurns` are OMITTED when the user did not supply a
 * valid value for them — this keeps `mergeConfig({})` deepEqual to
 * `defaultConfig` for back-compat.
 */
export interface PluginConfig {
    /** Header label shown above the reasoning block. */
    label: string;
    /** Render strategy applied to extracted reasoning (see `RenderStyle`). */
    style: RenderStyle;
    /**
     * Maximum number of lines to retain before rendering. Present only when
     * the user supplied a positive integer. Absent means "no truncation".
     */
    maxLines?: number;
    /**
     * Per-model override map. Present only when the user supplied a
     * non-empty `models` object. Empty maps are dropped silently.
     */
    models?: ModelConfigMap;
    /**
     * Extra XML tag names the detector should recognise in addition to
     * its built-in defaults. Present only when the user supplied a
     * non-empty array. Entries that duplicate a built-in tag are deduped
     * silently by the detector.
     */
    customTags?: ReadonlyArray<string>;
    /**
     * Context-window protection settings. Present only when the user
     * supplied a non-empty `compaction` object. When `stripReasoning` is
     * `true`, the plugin registers an `experimental.session.compacting`
     * hook on the plugin object.
     */
    compaction?: CompactionConfig;
    /**
     * When true, the `experimental.chat.messages.transform` hook removes the
     * rendered reasoning block from historical assistant messages BEFORE
     * the per-message transform loop runs. The most recent assistant message
     * is preserved; older assistant messages are stripped in chronological
     * order, keeping only the last `maxHistoryReasoningTurns - 1` historical
     * entries intact. Present only when the user explicitly opts in with
     * `true`.
     */
    stripHistory?: boolean;
    /**
     * Number of recent assistant turns (including the CURRENT one) that
     * keep their rendered reasoning when `stripHistory` is on. Default
     * `1` when the user did not supply a positive integer. Present only
     * when the user supplied a positive integer.
     */
    maxHistoryReasoningTurns?: number;
}

/**
 * User-supplied overrides passed via OpenCode plugin options. Unknown keys
 * are intentionally ignored by `mergeConfig` so older configs keep working.
 */
export interface UserConfig {
    /** Optional label override. Falls back to `defaultConfig.label` when omitted. */
    label?: string;
    /**
     * Optional render-style override. Falls back to `defaultConfig.style`
     * (`"markdown"`) when omitted. Unknown values are silently ignored by
     * `mergeConfig` for forward-compatibility — see `RenderStyle` for the
     * allowed set. Values are case-sensitive.
     */
    style?: RenderStyle;
    /**
     * Optional maximum number of lines to retain before rendering. Must be
     * a positive integer; any other shape (zero, negative, float, NaN, string)
     * is silently dropped by `mergeConfig`. Forwarded to every render style.
     */
    maxLines?: number;
    /**
     * Optional per-model override map. Must be a plain object; non-objects
     * (including strings, arrays, null) are silently dropped by `mergeConfig`.
     *
     * Patterns are evaluated in insertion order (first match wins) by
     * `resolveModelConfig`. See `ModelOverridePattern` for the supported
     * glob forms.
     */
    models?: ModelConfigMap;
    /**
     * Optional extra XML tag names. Must be an array of non-empty strings;
     * any other shape is silently dropped. Entries that duplicate a
     * built-in tag name are deduped silently by the detector.
     */
    customTags?: ReadonlyArray<string>;
    /**
     * Optional context-window protection settings. Must be a plain object;
     * non-objects (including strings, arrays, null) are silently dropped.
     * Only `stripReasoning: true` survives the sanitization pass — other
     * fields are reserved for future use and ignored.
     */
    compaction?: CompactionConfig;
    /**
     * Optional flag to prune reasoning from historical assistant messages.
     * Must be the literal boolean `true`; any other shape (string "true",
     * `1`, object, etc.) is silently dropped so a typo cannot enable the
     * feature.
     */
    stripHistory?: boolean;
    /**
     * Optional positive integer that controls how many recent assistant
     * turns keep their rendered reasoning when `stripHistory` is enabled.
     * `1` keeps only the current turn; `2` keeps current + 1 historical.
     * Default `1` when omitted. Must be a positive integer; other shapes
     * are silently dropped.
     */
    maxHistoryReasoningTurns?: number;
}

/**
 * Thinking-metadata side-channel attached to a `DetectionResult` when the
 * source message carries well-formed `thinking_duration_ms`,
 * `thinking_budget`, or `thinking_tokens` fields. All three are optional;
 * the renderer can display whatever subset is present.
 *
 * Only non-negative finite numbers are surfaced. `0` is a valid value
 * (model produced zero reasoning) and is preserved. NaN, Infinity,
 * strings, and negative numbers are dropped silently.
 */
export interface ReasoningMetadata {
    /** Wall-clock duration of the reasoning phase, in milliseconds. */
    durationMs?: number;
    /** Token budget allocated for reasoning (model-supplied upper bound). */
    budget?: number;
    /** Actual reasoning tokens consumed. */
    tokens?: number;
}

/**
 * Result of running `detectReasoning` on a message.
 *
 * `null` is returned when the message is invalid or no detection strategy
 * matches.
 *
 * The `metadata` side-channel is populated when the message carries
 * well-formed thinking-metadata fields (`thinking_duration_ms`,
 * `thinking_budget`, `thinking_tokens`). It runs alongside the detection
 * pass — first non-empty detection wins, and metadata is attached so the
 * renderer can show duration / token badges without a second scan.
 */
export interface DetectionResult {
    /** The extracted reasoning text. */
    reasoning: string;
    /** Which provider field / block / tag the reasoning came from. */
    source: string;
    /** Classification of how the reasoning was found. */
    kind: "block" | "text_tag" | "field";
    /**
     * Optional thinking-metadata side-channel. Present only when the
     * message contains at least one well-formed metadata field.
     */
    metadata?: ReasoningMetadata;
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