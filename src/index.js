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

export function transformMessage(msg, label) {
    if (!msg || !Array.isArray(msg.parts)) return

    const reasoningTexts = []
    const cleanParts = []

    for (const part of msg.parts) {
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

    // If no reasoning was found in parts or text tags, try top-level object fields (defense-in-depth)
    if (reasoningTexts.length === 0) {
        const synthetic = {
            content: cleanParts
                .filter((p) => p && p.type === "text")
                .map((p) => ({type: "text", text: p.text}))
        }
        const detection = detectReasoning(synthetic) || detectReasoning(msg)
        if (detection && detection.reasoning) {
            reasoningTexts.push(detection.reasoning)
        }
    }

    // If still no reasoning, leave message as is
    if (reasoningTexts.length === 0) {
        return
    }

    const reasoningBlock = reasoningTexts.map((t) => renderReasoning(t, label)).join("\n")

    // Prepend reasoning block to the first text part, or insert a new text part if none exist
    const firstTextIndex = cleanParts.findIndex((p) => p && p.type === "text")
    if (firstTextIndex !== -1) {
        cleanParts[firstTextIndex].text = reasoningBlock + cleanParts[firstTextIndex].text
        msg.parts = cleanParts
    } else {
        msg.parts = [{type: "text", text: reasoningBlock}, ...cleanParts]
    }
}

export default {
    id: "opencode-think-separator-plugin",
    server: ThinkSeparator
}
