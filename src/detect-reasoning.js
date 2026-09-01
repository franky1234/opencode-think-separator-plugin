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
    "chain_of_thought"
])

const REASONING_SET = new Set(REASONING_FIELDS)

const TAG_PATTERN_STR = REASONING_TAG_NAMES.join("|")
// Phase 1: Closed tags with optional whitespace inside tag
const CLOSED_TAG_REGEX = new RegExp(
    `<\\s*(${TAG_PATTERN_STR})\\b[^>]*>([\\s\\S]*?)<\\s*\\/\\s*\\1\\s*>`,
    "gi"
)
// Phase 2: Unclosed tags extending to the end of string
const UNCLOSED_TAG_REGEX = new RegExp(`<\\s*(${TAG_PATTERN_STR})\\b[^>]*>([\\s\\S]*)$`, "gi")
// Phase 3: Any orphan opening or closing tags
const ORPHAN_TAG_REGEX = new RegExp(`<\\s*\\/?\\s*(${TAG_PATTERN_STR})\\b[^>]*>`, "gi")

/**
 * Extracts reasoning blocks found inside XML-like tags (e.g. <think>...</think>)
 * from a text string. Handles closed tags and unclosed tags at the end of text.
 *
 * Implemented as a 3-phase linear pipeline (closed → unclosed → orphan sanitization).
 * Keeping the phases inline keeps each `.replace()` callback local and avoids an
 * accumulator threading pattern that would add ceremony without clarity.
 *
 * @param {string} text
 * @returns {{ reasoningTexts: string[], cleanText: string }}
 */
export function extractReasoningFromText(text) {
    if (typeof text !== "string" || !text.includes("<")) {
        return {reasoningTexts: [], cleanText: text || ""}
    }

    /** @type {string[]} */
    const reasoningTexts = []

    // 1. Extract and remove closed tags first
    let remaining = text.replace(CLOSED_TAG_REGEX, (match, tagName, content) => {
        const trimmed = content.trim()
        if (trimmed.length > 0) {
            reasoningTexts.push(trimmed)
        }
        return ""
    })

    // 2. Extract and remove any remaining unclosed tags (e.g. <think>... at end of string)
    remaining = remaining.replace(UNCLOSED_TAG_REGEX, (match, tagName, content) => {
        const trimmed = content.trim()
        if (trimmed.length > 0) {
            reasoningTexts.push(trimmed)
        }
        return ""
    })

    // 3. Remove any remaining orphan opening/closing tags
    const cleanText = remaining.replace(ORPHAN_TAG_REGEX, "").trim()

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
 * @returns {{reasoning: string, source: "tag", kind: "text_tag"} | null}
 */
function detectInContentTextTags(message) {
    if (!Array.isArray(message.content)) return null
    for (const block of message.content) {
        if (
            block &&
            typeof block === "object" &&
            block.type === "text" &&
            typeof block.text === "string"
        ) {
            const extracted = extractReasoningFromText(block.text)
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
 * @returns {{reasoning: string, source: "tag", kind: "text_tag"} | null}
 */
function detectInStringContent(message) {
    if (typeof message.content !== "string") return null
    const extracted = extractReasoningFromText(message.content)
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
 * Strategy runner. Order is significant — strategies earlier in the array take
 * precedence over later ones, mirroring the original `detectReasoning` priority.
 */
const DETECTION_STRATEGIES = Object.freeze([
    detectInContentBlocks,
    detectInContentTextTags,
    detectInTopLevelFields,
    detectInStringContent
])

/**
 * Runs the detection strategies in priority order and returns the first match.
 * Returns `null` when the message is invalid or no strategy detects reasoning.
 *
 * @param {Record<string, unknown> | null | undefined} message
 * @returns {{reasoning: string, source: string, kind: string} | null}
 */
export function detectReasoning(message) {
    if (!message || typeof message !== "object") return null
    for (const strategy of DETECTION_STRATEGIES) {
        const result = strategy(message)
        if (result) return result
    }
    return null
}
