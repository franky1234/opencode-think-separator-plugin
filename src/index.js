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
 * v0.3.0+: per-message config resolution via `resolveModelConfig(msg.info?.model)`,
 * custom XML tag whitelist forwarded to the detector, and reasoning metadata
 * (durationMs / tokens) surfaced as a header badge when the fallback detector
 * finds reasoning on a top-level field.
 *
 * Module contract: opencode v1 plugins default-export `{ id, server }`
 * (see packages/opencode/src/plugin/shared.ts `readV1Plugin`). We do NOT
 * rely on the v0 "enumerated exports" fallback because it iterates every
 * module export and would mistake the `transformMessage` helper (exported
 * here for testability) for a second plugin function.
 */

import {mergeConfig, resolveModelConfig} from "./config.js"
import {detectReasoning, extractReasoningFromText} from "./detect-reasoning.js"
import {renderReasoning} from "./render.js"

/**
 * Normalise the polymorphic second argument of `transformMessage` into a
 * canonical `{label, style, customTags}` shape.
 *
 * Accepts:
 * - `string`          — back-compat: treated as the label only (style and
 *                       customTags default; matches v0.2.0 byte-for-byte).
 * - `{label, style, customTags}` — full options object (any field may be
 *                       missing or invalid; defaults applied per-field).
 * - `undefined | null | anything else` — all defaults.
 *
 * Style validation mirrors `render.js#normalizeOptions`: unknown values
 * silently fall back to `"markdown"` so a misconfigured per-model override
 * cannot crash the pipeline.
 *
 * @param {string|{label?: string, style?: string, customTags?: ReadonlyArray<string>}|undefined|null|*} optionsOrConfig
 * @returns {{label: string, style: string, customTags: ReadonlyArray<string>|undefined}}
 */
function normalizeTransformOptions(optionsOrConfig) {
    if (typeof optionsOrConfig === "string") {
        const label = optionsOrConfig.length > 0 ? optionsOrConfig : "Reasoning"
        return {label, style: "markdown", customTags: undefined}
    }
    if (optionsOrConfig && typeof optionsOrConfig === "object") {
        const label =
            typeof optionsOrConfig.label === "string" && optionsOrConfig.label.length > 0
                ? optionsOrConfig.label
                : "Reasoning"
        const style =
            typeof optionsOrConfig.style === "string" &&
            Object.prototype.hasOwnProperty.call(
                {markdown: 1, details: 1, strip: 1, raw: 1},
                optionsOrConfig.style
            )
                ? optionsOrConfig.style
                : "markdown"
        const customTags = Array.isArray(optionsOrConfig.customTags)
            ? optionsOrConfig.customTags
            : undefined
        return {label, style, customTags}
    }
    return {label: "Reasoning", style: "markdown", customTags: undefined}
}

/**
 * Stage 1: Classify each part into reasoning (extracted text) or clean (kept as-is).
 * For type:text parts with embedded XML reasoning tags, the tags are stripped and the
 * reasoning is captured separately; the cleaned part is kept in cleanParts.
 *
 * When `customTags` is supplied, only those XML tag names are recognised inside
 * text parts — useful when a provider uses a non-standard reasoning tag and the
 * user opts into a custom whitelist.
 *
 * @param {Array<unknown>} parts
 * @param {ReadonlyArray<string>|undefined} customTags - Optional tag whitelist forwarded to extractReasoningFromText.
 * @returns {{ reasoningTexts: string[], cleanParts: Array<unknown> }}
 */
function partitionMessageParts(parts, customTags) {
    /** @type {string[]} */
    const reasoningTexts = []
    /** @type {Array<unknown>} */
    const cleanParts = []

    for (const part of parts) {
        if (!part || typeof part !== "object") continue

        /** @type {{type?: string, text?: string}} */
        const objPart = /** @type {{type?: string, text?: string}} */ (part)

        // Case 1: opencode-native or provider-specific reasoning parts
        if (
            (objPart.type === "reasoning" || objPart.type === "thinking") &&
            typeof objPart.text === "string" &&
            objPart.text.length > 0
        ) {
            reasoningTexts.push(objPart.text)
            continue
        }

        // Case 2: text part that may contain XML reasoning tags (<think>...</think>, etc.)
        if (objPart.type === "text" && typeof objPart.text === "string") {
            const extracted = extractReasoningFromText(objPart.text, customTags)
            if (extracted.reasoningTexts.length > 0) {
                reasoningTexts.push(...extracted.reasoningTexts)
            }
            objPart.text = extracted.cleanText
            cleanParts.push(objPart)
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
 * Returns BOTH the extracted reasoning texts AND any metadata the detector
 * attached (durationMs / tokens / budget). The metadata is needed downstream
 * by the renderer to surface a header badge when reasoning was discovered via
 * the fallback path. When Stage 1 already extracted reasoning, no metadata
 * is available (no detectReasoning call was made) — the renderer falls back
 * to a badge-free header, matching v0.2.0 output for that path.
 *
 * @param {Array<unknown>} cleanParts
 * @param {Record<string, unknown>} msg
 * @param {number} existingReasoningCount
 * @param {ReadonlyArray<string>|undefined} customTags - Optional tag whitelist forwarded to detectReasoning.
 * @returns {{texts: string[], metadata: {durationMs?: number, budget?: number, tokens?: number}|undefined}}
 */
function resolveFallbackReasoning(cleanParts, msg, existingReasoningCount, customTags) {
    if (existingReasoningCount > 0) return {texts: [], metadata: undefined}

    const synthetic = {
        content: cleanParts
            .filter(
                /** @returns {p is {type?: string, text?: string}} */
                (p) => /** @type {{type?: string}} */ (p)?.type === "text"
            )
            .map((p) => ({type: "text", text: /** @type {{text?: string}} */ (p).text}))
    }
    const detection =
        detectReasoning(/** @type {Record<string, unknown>} */ (synthetic), customTags) ||
        detectReasoning(/** @type {Record<string, unknown>} */ (msg), customTags)
    if (detection?.reasoning) {
        return {texts: [detection.reasoning], metadata: detection.metadata}
    }
    return {texts: [], metadata: undefined}
}

/**
 * Stage 3: Format the reasoning block and prepend it to the first text part of
 * cleanParts. If no text part exists, insert a new leading text part.
 *
 * Mutates `cleanParts` in-place (same behavior as the original code).
 *
 * @param {Array<{type?: string, text?: string}>} cleanParts
 * @param {string[]} reasoningTexts
 * @param {string} label
 * @param {string} style
 * @param {{durationMs?: number, budget?: number, tokens?: number}|undefined} metadata
 */
function injectReasoningBlock(cleanParts, reasoningTexts, label, style, metadata) {
    const reasoningBlock = reasoningTexts
        .map((t) => renderReasoning(t, {label, style, metadata}))
        .join("\n")

    const firstTextIndex = cleanParts.findIndex((p) => p && p.type === "text")
    if (firstTextIndex !== -1) {
        cleanParts[firstTextIndex].text = reasoningBlock + cleanParts[firstTextIndex].text
    } else {
        cleanParts.unshift({type: "text", text: reasoningBlock})
    }
}

/**
 * Factory: builds the opencode v1 plugin object. The returned async function
 * is the implementation of `experimental.chat.messages.transform`.
 *
 * For each assistant message, the per-message plugin config is resolved via
 * `resolveModelConfig(msg.info?.model)` so per-model overrides (label, style)
 * apply automatically without per-call wiring. Messages without a model id
 * (or with `info` missing) fall back to the base config — matches v0.2.0
 * behaviour for environments that do not populate `msg.info.model`.
 *
 * @param {Record<string, unknown> | undefined} _input - Plugin load input (unused; opencode-specific).
 * @param {import("../types/index.js").UserConfig | undefined} options - User config object.
 * @returns {Promise<Record<string, unknown>>} Plugin object with the chat-messages transform hook.
 */
export const ThinkSeparator = async (
    /** @type {Record<string, unknown> | undefined} */ _input,
    /** @type {import("../types/index.js").UserConfig | undefined} */ options
) => {
    const baseConfig = mergeConfig(options || {})
    return {
        "experimental.chat.messages.transform": async (
            /** @type {Record<string, unknown> | undefined} */ _hookInput,
            /** @type {{messages?: Array<Record<string, unknown>>} | undefined} */ output
        ) => {
            if (!output || !Array.isArray(output.messages)) return
            for (const msg of output.messages) {
                if (msg.info && /** @type {{role?: string}} */ (msg.info).role !== "assistant")
                    continue
                const modelId = /** @type {{model?: unknown}} */ (msg.info)?.model
                const perMsgConfig = resolveModelConfig(
                    /** @type {string|null|undefined} */ (
                        typeof modelId === "string" ? modelId : undefined
                    ),
                    baseConfig
                )
                transformMessage(msg, perMsgConfig)
            }
        }
    }
}

/**
 * Public: Transform one assistant message by rewriting reasoning parts into a
 * styled text block, while preserving all other parts (tool calls, images, etc.).
 *
 * Behavior contract (verified by 8 tests in test/plugin.test.js + 12 in
 * test/pipeline-integration.test.js):
 * - No-op when msg or msg.parts is invalid.
 * - No-op when no reasoning is found (parts unchanged).
 * - For reasoning parts: removed, merged into a leading text part.
 * - For text parts with XML tags: tags stripped, reasoning captured separately.
 * - For other parts (tool_use, etc.): preserved untouched, in original order.
 * - Per-model config (label, style) applied via `optionsOrConfig` object.
 * - Custom XML tag whitelist applied to partitionMessageParts and
 *   resolveFallbackReasoning when `customTags` is provided.
 * - Reasoning metadata (durationMs / tokens) surfaces as a header badge when
 *   the fallback detector runs AND finds metadata on the same message.
 *
 * @param {Record<string, unknown> | null | undefined} msg - OpenCode assistant message; mutated in place.
 * @param {string|{label?: string, style?: string, customTags?: ReadonlyArray<string>}|undefined} [optionsOrConfig]
 *   Either a label string (back-compat) or a per-message config object.
 * @returns {void}
 */
export function transformMessage(msg, optionsOrConfig) {
    if (!msg || !Array.isArray(msg.parts)) return

    const {label, style, customTags} = normalizeTransformOptions(optionsOrConfig)
    const msgParts = /** @type {Array<unknown>} */ (msg.parts)
    const {reasoningTexts, cleanParts} = partitionMessageParts(msgParts, customTags)
    const {texts: additionalTexts, metadata: fallbackMetadata} = resolveFallbackReasoning(
        cleanParts,
        msg,
        reasoningTexts.length,
        customTags
    )
    const allReasoningTexts = [...reasoningTexts, ...additionalTexts]
    if (allReasoningTexts.length === 0) return

    injectReasoningBlock(
        /** @type {Array<{type?: string, text?: string}>} */ (/** @type {unknown} */ (cleanParts)),
        allReasoningTexts,
        label,
        style,
        fallbackMetadata
    )
    msg.parts = cleanParts
}

export default {
    id: "opencode-think-separator-plugin",
    server: ThinkSeparator
}
