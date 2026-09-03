/**
 * Provider-agnostic reasoning-block detector.
 *
 * Architecture: Strategy Pattern as plain named functions (no class machinery).
 *
 * Detection strategies run in priority order; the first to match wins:
 *   1. detectInContentBlocks  — content[] entries whose `type` is in REASONING_SET
 *                              (Anthropic / MiniMax thinking blocks).
 *   2. detectInContentTextTags — content[] text blocks wrapped in XML reasoning tags.
 *   3. detectInTopLevelFields — top-level message.<field> matching REASONING_FIELDS
 *                              (OpenAI reasoning_content, Google thoughts).
 *   4. detectInStringContent  — message.content as a raw string with XML reasoning tags.
 *
 * Whitelist is exhaustive — no guessing, no substring matching. Adding a new
 * provider means adding its field name to REASONING_FIELDS, not editing logic.
 */

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

const REASONING_SET = new Set(REASONING_FIELDS)

/**
 * Build the 3-phase regex set for a given tag-name list.
 *
 * Returns `{CLOSED, UNCLOSED, ORPHAN}` RegExp objects matching the three
 * extraction phases used by `extractReasoningFromText`. The result is
 * memoized per input array reference in a `WeakMap`, so repeated calls
 * with the same frozen default array (e.g. `REASONING_TAG_NAMES`) hit
 * the cache and incur zero compilation cost on the hot path.
 *
 * The cache key is the array reference itself — callers are expected to
 * pass either the frozen `REASONING_TAG_NAMES` or a fresh array they own.
 * Passing a different array (or a custom-tags override) produces fresh
 * regex objects without mutating any cached entry.
 *
 * @param {ReadonlyArray<string>} tags
 * @returns {{CLOSED: RegExp, UNCLOSED: RegExp, ORPHAN: RegExp}}
 */
export function compileReasoningTagRegex(tags) {
    /** @type {WeakMap<ReadonlyArray<string>, {CLOSED: RegExp, UNCLOSED: RegExp, ORPHAN: RegExp}>} */
    const cache = COMPILED_REGEX_CACHE
    const cached = cache.get(tags)
    if (cached) return cached

    const patternStr = tags.join("|")
    // Phase 1: Closed tags with optional whitespace inside tag
    const compiled = Object.freeze({
        CLOSED: new RegExp(`<\\s*(${patternStr})\\b[^>]*>([\\s\\S]*?)<\\s*\\/\\s*\\1\\s*>`, "gi"),
        // Phase 2: Unclosed tags extending to the end of string
        UNCLOSED: new RegExp(`<\\s*(${patternStr})\\b[^>]*>([\\s\\S]*)$`, "gi"),
        // Phase 3: Any orphan opening or closing tags
        ORPHAN: new RegExp(`<\\s*\\/?\\s*(${patternStr})\\b[^>]*>`, "gi")
    })
    cache.set(tags, compiled)
    return compiled
}

/**
 * Cache of compiled regex sets keyed by tag-array reference.
 *
 * Module-private — kept here so the default-path regex set is compiled
 * lazily on first use and reused thereafter. The frozen
 * `REASONING_TAG_NAMES` constant is the typical key.
 *
 * @type {WeakMap<ReadonlyArray<string>, {CLOSED: RegExp, UNCLOSED: RegExp, ORPHAN: RegExp}>}
 */
const COMPILED_REGEX_CACHE = new WeakMap()

/**
 * Top-level reasoning-tag metadata fields. Each maps to a key on
 * `DetectionResult.metadata`. Numbers only — strings, NaN, Infinity and
 * negatives are dropped by `extractMetadata`.
 *
 * @type {ReadonlyArray<{source: string, key: "durationMs" | "budget" | "tokens"}>}
 */
const REASONING_METADATA_FIELDS = Object.freeze([
    Object.freeze({source: "thinking_duration_ms", key: "durationMs"}),
    Object.freeze({source: "thinking_budget", key: "budget"}),
    Object.freeze({source: "thinking_tokens", key: "tokens"})
])

/**
 * Pulls thinking-metadata fields off a message if they are well-formed
 * non-negative finite numbers. Returns `undefined` when no field is
 * usable, otherwise a partial object with only the supplied keys.
 *
 * `0` is considered a valid value (the model produced zero reasoning —
 * still useful to surface). NaN / Infinity / strings / negatives are
 * dropped silently so providers that mis-shape the field cannot break
 * the renderer.
 *
 * @param {Record<string, unknown> | null | undefined} message
 * @returns {{durationMs?: number, budget?: number, tokens?: number} | undefined}
 */
export function extractMetadata(message) {
    if (!message || typeof message !== "object") return undefined
    /** @type {{durationMs?: number, budget?: number, tokens?: number}} */
    const out = {}
    let found = false
    for (const {source, key} of REASONING_METADATA_FIELDS) {
        const value = message[source]
        if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
            out[key] = value
            found = true
        }
    }
    return found ? out : undefined
}

/**
 * Normalise a user-supplied tags array. Returns the default whitelist
 * when the input is missing, empty, or contains no valid string entries.
 * Filters out non-strings defensively so a mis-shaped `customTags` from
 * config cannot crash the detector.
 *
 * @param {unknown} tags
 * @returns {ReadonlyArray<string>}
 */
function resolveTags(tags) {
    if (!Array.isArray(tags)) return REASONING_TAG_NAMES
    /** @type {string[]} */
    const filtered = []
    for (const entry of tags) {
        if (typeof entry === "string" && entry.length > 0) filtered.push(entry)
    }
    return filtered.length > 0 ? filtered : REASONING_TAG_NAMES
}

/**
 * Extracts reasoning blocks found inside XML-like tags (e.g. <think>...</think>)
 * from a text string. Handles closed tags and unclosed tags at the end of text.
 *
 * Implemented as a 3-phase linear pipeline (closed → unclosed → orphan sanitization).
 * Keeping the phases inline keeps each `.replace()` callback local and avoids an
 * accumulator threading pattern that would add ceremony without clarity.
 *
 * When `tags` is omitted (or not a non-empty array of strings), the built-in
 * `REASONING_TAG_NAMES` whitelist is used — preserving v0.2.0 behaviour byte
 * for byte. When `tags` is supplied, it REPLACES the defaults (does not merge):
 * users opting into `customTags` get exactly what they configured.
 *
 * @param {string} text
 * @param {ReadonlyArray<string>} [tags] Optional override tag whitelist.
 * @returns {{ reasoningTexts: string[], cleanText: string }}
 */
export function extractReasoningFromText(text, tags) {
    if (typeof text !== "string" || !text.includes("<")) {
        return {reasoningTexts: [], cleanText: text || ""}
    }

    const effectiveTags = resolveTags(tags)
    const {CLOSED, UNCLOSED, ORPHAN} = compileReasoningTagRegex(effectiveTags)

    /** @type {string[]} */
    const reasoningTexts = []

    // 1. Extract and remove closed tags first
    let remaining = text.replace(CLOSED, (match, tagName, content) => {
        const trimmed = content.trim()
        if (trimmed.length > 0) {
            reasoningTexts.push(trimmed)
        }
        return ""
    })

    // 2. Extract and remove any remaining unclosed tags (e.g. <think>... at end of string)
    remaining = remaining.replace(UNCLOSED, (match, tagName, content) => {
        const trimmed = content.trim()
        if (trimmed.length > 0) {
            reasoningTexts.push(trimmed)
        }
        return ""
    })

    // 3. Remove any remaining orphan opening/closing tags
    const cleanText = remaining.replace(ORPHAN, "").trim()

    return {reasoningTexts, cleanText}
}

/**
 * Detection strategy: scans `message.content[]` for blocks whose `type` is in
 * REASONING_SET. Returns the first match (Anthropic / MiniMax style thinking blocks).
 *
 * @param {{content?: Array<{type: string, [k: string]: unknown}>}} message
 * @returns {{reasoning: string, source: string, kind: "block"} | null}
 */
function detectInContentBlocks(message) {
    if (!Array.isArray(message.content)) return null
    for (const block of message.content) {
        if (block && typeof block === "object" && REASONING_SET.has(block.type)) {
            const text = block[block.type]
            if (typeof text === "string" && text.length > 0) {
                return {reasoning: text, source: block.type, kind: "block"}
            }
        }
    }
    return null
}

/**
 * Detection strategy: scans `message.content[]` text blocks for XML reasoning tags.
 * Returns the first text block whose content contains extractable reasoning, with
 * all extracted reasoning blocks joined by `\n\n`.
 *
 * @param {{content?: Array<{type: string, text?: string}>}} message
 * @param {ReadonlyArray<string>} [tags] Optional override tag whitelist.
 * @returns {{reasoning: string, source: "tag", kind: "text_tag"} | null}
 */
function detectInContentTextTags(message, tags) {
    if (!Array.isArray(message.content)) return null
    for (const block of message.content) {
        if (
            block &&
            typeof block === "object" &&
            block.type === "text" &&
            typeof block.text === "string"
        ) {
            const extracted = extractReasoningFromText(block.text, tags)
            if (extracted.reasoningTexts.length > 0) {
                return {
                    reasoning: extracted.reasoningTexts.join("\n\n"),
                    source: "tag",
                    kind: "text_tag"
                }
            }
        }
    }
    return null
}

/**
 * Detection strategy: scans top-level `message[field]` for fields in REASONING_FIELDS.
 * Iterates REASONING_FIELDS in declared order so earlier whitelisted names win.
 *
 * @param {Record<string, unknown>} message
 * @returns {{reasoning: string, source: string, kind: "field"} | null}
 */
function detectInTopLevelFields(message) {
    for (const field of REASONING_FIELDS) {
        if (field in message && typeof message[field] === "string" && message[field].length > 0) {
            return {reasoning: message[field], source: field, kind: "field"}
        }
    }
    return null
}

/**
 * Detection strategy: scans `message.content` when it is a raw string with XML
 * reasoning tags (e.g. providers that emit a plain string with `<think>...</think>`).
 *
 * @param {{content?: unknown}} message
 * @param {ReadonlyArray<string>} [tags] Optional override tag whitelist.
 * @returns {{reasoning: string, source: "tag", kind: "text_tag"} | null}
 */
function detectInStringContent(message, tags) {
    if (typeof message.content !== "string") return null
    const extracted = extractReasoningFromText(message.content, tags)
    if (extracted.reasoningTexts.length > 0) {
        return {
            reasoning: extracted.reasoningTexts.join("\n\n"),
            source: "tag",
            kind: "text_tag"
        }
    }
    return null
}

/**
 * Strategy signature shared by every detector in the runner array. The
 * `kind` field is the discriminator consumed by `DetectionResult.kind`
 * — typed here as a string union so the runner preserves the literal
 * narrowness (without it, the frozen-array element type widens to
 * `string` and breaks the `DetectionResult` return contract).
 *
 * @typedef {(message: Record<string, unknown>, tags?: ReadonlyArray<string>) =>
 *   {reasoning: string, source: string, kind: "block" | "text_tag" | "field"} | null
 * } DetectionStrategy
 */

/**
 * Strategy runner. Order is significant — strategies earlier in the array take
 * precedence over later ones, mirroring the original `detectReasoning` priority.
 *
 * `detectInContentBlocks` and `detectInTopLevelFields` ignore the `tags`
 * argument (they work off REASONING_FIELDS / block types, not XML tags);
 * passing it straight through is harmless and keeps the runner generic.
 *
 * @type {ReadonlyArray<DetectionStrategy>}
 */
const DETECTION_STRATEGIES = Object.freeze([
    /** @type {DetectionStrategy} */ (detectInContentBlocks),
    /** @type {DetectionStrategy} */ (detectInContentTextTags),
    /** @type {DetectionStrategy} */ (detectInTopLevelFields),
    /** @type {DetectionStrategy} */ (detectInStringContent)
])

/**
 * Runs the detection strategies in priority order and returns the first match.
 * Returns `null` when the message is invalid or no strategy detects reasoning.
 *
 * When a detection succeeds, the result is enriched with a `metadata`
 * side-channel object containing any well-formed thinking-metadata fields
 * (`thinking_duration_ms`, `thinking_budget`, `thinking_tokens`) found on
 * the same message. The metadata extraction runs alongside detection —
 * the first non-empty detection wins, and metadata from the same message
 * is attached so the renderer can display duration / token badges without
 * a second pass.
 *
 * @param {Record<string, unknown> | null | undefined} message
 * @param {ReadonlyArray<string>} [tags] Optional override XML tag whitelist
 *   (e.g. from `config.customTags`). Replaces the built-in defaults;
 *   does not merge.
 * @returns {{reasoning: string, source: string, kind: "block" | "text_tag" | "field", metadata?: {durationMs?: number, budget?: number, tokens?: number}} | null}
 */
export function detectReasoning(message, tags) {
    if (!message || typeof message !== "object") return null
    for (const strategy of DETECTION_STRATEGIES) {
        const result = strategy(message, tags)
        if (result) {
            const metadata = extractMetadata(message)
            return metadata ? {...result, metadata} : result
        }
    }
    return null
}
