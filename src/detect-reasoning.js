/**
 * Provider-agnostic reasoning-block detector.
 *
 * Strategy:
 *   1. Scan message.content[] for blocks whose `type` is in REASONING_FIELDS
 *      (Anthropic / MiniMax style: { type: "thinking", thinking: "..." }).
 *   2. Scan top-level message.<field> for fields in REASONING_FIELDS
 *      (OpenAI / Google style: message.reasoning_content = "...").
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
 * @param {string} text
 * @returns {{ reasoningTexts: string[], cleanText: string }}
 */
export function extractReasoningFromText(text) {
    if (typeof text !== "string" || !text.includes("<")) {
        return {reasoningTexts: [], cleanText: text || ""}
    }

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

export function detectReasoning(message) {
    if (!message || typeof message !== "object") return null

    if (Array.isArray(message.content)) {
        for (const block of message.content) {
            if (block && typeof block === "object") {
                if (REASONING_SET.has(block.type)) {
                    const text = block[block.type]
                    if (typeof text === "string" && text.length > 0) {
                        return {reasoning: text, source: block.type, kind: "block"}
                    }
                }
                if (block.type === "text" && typeof block.text === "string") {
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
        }
    }

    for (const field of REASONING_FIELDS) {
        if (field in message && typeof message[field] === "string" && message[field].length > 0) {
            return {reasoning: message[field], source: field, kind: "field"}
        }
    }

    if (typeof message.content === "string") {
        const extracted = extractReasoningFromText(message.content)
        if (extracted.reasoningTexts.length > 0) {
            return {
                reasoning: extracted.reasoningTexts.join("\n\n"),
                source: "tag",
                kind: "text_tag"
            }
        }
    }

    return null
}
