/**
 * opencode-think-separator-plugin — server-side entry.
 *
 * Rewrites reasoning parts in assistant messages so that the reasoning
 * block is rendered with a visual separator above the final response.
 *
 * Mechanism: experimental.chat.messages.transform receives all messages
 * before persistence. For each assistant message, any `type: "reasoning"`
 * part is converted into a text part prefixed with `── Reasoning ──`,
 * dim-formatted via src/render.js. The original reasoning part is removed
 * because it is now represented visually inside the text part.
 *
 * Defense-in-depth: providers that emit reasoning in a non-standard shape
 * (e.g. Anthropic/MiniMax `content[]` blocks with type "thinking",
 * OpenAI `reasoning_content` top-level field) are also detected and
 * surfaced, even though opencode normalizes most providers to
 * `type: "reasoning"` parts internally.
 *
 * Module contract: opencode v1 plugins default-export `{ id, server }`
 * (see packages/opencode/src/plugin/shared.ts `readV1Plugin`). We do NOT
 * rely on the v0 "enumerated exports" fallback because it iterates every
 * module export and would mistake the `transformMessage` helper (exported
 * here for testability) for a second plugin function.
 */

import {detectReasoning, extractReasoningFromText} from "./detect-reasoning.js"
import {renderReasoning} from "./render.js"
import {mergeConfig} from "./config.js"

/**
 * Stage 1: Classify each part into reasoning (extracted text) or clean (kept as-is).
 * For type:text parts with embedded XML reasoning tags, the tags are stripped and the
 * reasoning is captured separately; the cleaned part is kept in cleanParts.
 *
 * @param {object[]} parts
 * @returns {{ reasoningTexts: string[], cleanParts: object[] }}
 */
function partitionMessageParts(parts) {
    const reasoningTexts = []
    const cleanParts = []

    for (const part of parts) {
        if (!part || typeof part !== "object") continue

        // Case 1: opencode-native or provider-specific reasoning parts
        if (
            (part.type === "reasoning" || part.type === "thinking") &&
            typeof part.text === "string" &&
            part.text.length > 0
        ) {
            reasoningTexts.push(part.text)
            continue
        }

        // Case 2: text part that may contain XML reasoning tags (<think>...</think>, etc.)
        if (part.type === "text" && typeof part.text === "string") {
            const extracted = extractReasoningFromText(part.text)
            if (extracted.reasoningTexts.length > 0) {
                reasoningTexts.push(...extracted.reasoningTexts)
            }
            part.text = extracted.cleanText
            cleanParts.push(part)
            continue
        }

        // Case 3: Other parts (tool_use, image, tool_result, etc.) are preserved untouched
        cleanParts.push(part)
    }

    return {reasoningTexts, cleanParts}
}

/**
 * Stage 2: Defense-in-depth fallback. Only runs when Stage 1 found NO reasoning.
 * Builds a synthetic content[] from cleanParts (text only) and runs detectReasoning
 * on both the synthetic and the raw msg — first match wins.
 *
 * @param {object[]} cleanParts
 * @param {object} msg
 * @param {number} existingReasoningCount
 * @returns {string[]} Additional reasoning texts (empty if none detected)
 */
function resolveFallbackReasoning(cleanParts, msg, existingReasoningCount) {
    if (existingReasoningCount > 0) return []

    const synthetic = {
        content: cleanParts
            .filter((p) => p && p.type === "text")
            .map((p) => ({type: "text", text: p.text}))
    }
    const detection = detectReasoning(synthetic) || detectReasoning(msg)
    if (detection && detection.reasoning) {
        return [detection.reasoning]
    }
    return []
}

/**
 * Stage 3: Format the reasoning block and prepend it to the first text part of
 * cleanParts. If no text part exists, insert a new leading text part.
 *
 * Mutates `cleanParts` in-place (same behavior as the original code).
 *
 * @param {object[]} cleanParts
 * @param {string[]} reasoningTexts
 * @param {string} label
 */
function injectReasoningBlock(cleanParts, reasoningTexts, label) {
    const reasoningBlock = reasoningTexts.map((t) => renderReasoning(t, label)).join("\n")

    const firstTextIndex = cleanParts.findIndex((p) => p && p.type === "text")
    if (firstTextIndex !== -1) {
        cleanParts[firstTextIndex].text = reasoningBlock + cleanParts[firstTextIndex].text
    } else {
        cleanParts.unshift({type: "text", text: reasoningBlock})
    }
}

export const ThinkSeparator = async (input, options) => {
    const config = mergeConfig(options || {})
    return {
        "experimental.chat.messages.transform": async (_hookInput, output) => {
            if (!output || !Array.isArray(output.messages)) return
            for (const msg of output.messages) {
                if (msg.info && msg.info.role !== "assistant") continue
                transformMessage(msg, config.label)
            }
        }
    }
}

/**
 * Public: Transform one assistant message by rewriting reasoning parts into a
 * styled text block, while preserving all other parts (tool calls, images, etc.).
 *
 * Behavior contract (verified by 8 tests in test/plugin.test.js):
 * - No-op when msg or msg.parts is invalid.
 * - No-op when no reasoning is found (parts unchanged).
 * - For reasoning parts: removed, merged into a leading text part.
 * - For text parts with XML tags: tags stripped, reasoning captured separately.
 * - For other parts (tool_use, etc.): preserved untouched, in original order.
 *
 * @param {object} msg - OpenCode assistant message; mutated in place.
 * @param {string} label - Header label for the reasoning block.
 * @returns {void}
 */
export function transformMessage(msg, label) {
    if (!msg || !Array.isArray(msg.parts)) return

    const {reasoningTexts, cleanParts} = partitionMessageParts(msg.parts)
    const additionalTexts = resolveFallbackReasoning(cleanParts, msg, reasoningTexts.length)
    const allReasoningTexts = [...reasoningTexts, ...additionalTexts]
    if (allReasoningTexts.length === 0) return

    injectReasoningBlock(cleanParts, allReasoningTexts, label)
    msg.parts = cleanParts
}

export default {
    id: "opencode-think-separator-plugin",
    server: ThinkSeparator
}
