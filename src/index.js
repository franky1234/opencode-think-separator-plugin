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
import {RENDER_STYLES, renderReasoning} from "./render.js"

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
            Object.prototype.hasOwnProperty.call(RENDER_STYLES, optionsOrConfig.style)
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
    if (reasoningTexts.length === 0) return
    // Join multiple reasoning blocks with a clean blank-line separator so the
    // renderer produces a single header and the bodies render as continuous
    // blockquoted content under it (no duplicate `### ── Reasoning ──` lines).
    const combinedReasoning = reasoningTexts.join("\n\n")
    const reasoningBlock = renderReasoning(combinedReasoning, {label, style, metadata})

    const firstTextIndex = cleanParts.findIndex((p) => p && p.type === "text")
    if (firstTextIndex !== -1) {
        cleanParts[firstTextIndex].text = reasoningBlock + cleanParts[firstTextIndex].text
    } else {
        cleanParts.unshift({type: "text", text: reasoningBlock})
    }
}

/**
 * Remove the already-rendered reasoning block from a piece of assistant text.
 *
 * The reasoning block has a fixed canonical shape produced by the renderer:
 * a header line (`> ### ── <label> ──`), followed by blockquote-prefixed body
 * lines (`> *...*`, `> ...`, or `>` for blank body lines inside the
 * blockquote), followed by a blank line that separates the reasoning block
 * from the final response.
 *
 * This is a label-agnostic strip: it matches any `> ### ── ... ──` header so
 * users with custom labels still get the reasoning block removed correctly.
 * Returns a new string with the reasoning block fully removed (header + body
 * + the trailing blank-line separator), leaving only the final response text.
 *
 * Algorithm: line-by-line scan (more robust than a single regex because the
 * blockquote body can contain code fences and lists that defeat greedy
 * matching). State machine with two modes — "copy" (default) and "strip"
 * (entered when the header is matched, exited when a blank line is found).
 *
 * Edge cases:
 * - Text with no reasoning header is returned byte-identical.
 * - A trailing `> ...` blockquote line that is NOT followed by a blank line
 *   (malformed reasoning block) terminates the strip at the first non-block
 *   line and keeps that line — defensive against accidental damage.
 *
 * Style note: this strip targets the rendered blockquote shape
 * (`markdown`, `quote`, `compact` styles). Styles like `details`, `raw`,
 * and `strip` produce different output formats and are NOT affected by
 * this function — their historical reasoning passes through unchanged.
 *
 * @param {string} text - Rendered assistant text (may contain a reasoning block at the start).
 * @returns {string} The same text with the leading reasoning block (if any) removed.
 */
export function stripReasoningBlock(text) {
    if (typeof text !== "string" || text.length === 0) return text
    const lines = text.split("\n")
    /** @type {string[]} */
    const out = []
    let stripping = false
    for (const line of lines) {
        if (!stripping) {
            if (line.startsWith("> ### ──")) {
                stripping = true
                continue
            }
            out.push(line)
            continue
        }
        // Stripping mode — consume blockquote lines + the blank-line terminator.
        if (line.length === 0) {
            // Blank line ends the reasoning block. Consume it so the final
            // response starts immediately with no leading gap.
            stripping = false
            continue
        }
        if (line.startsWith(">")) {
            // Blockquote-prefixed body line — consume.
            continue
        }
        // Non-blockquote content reached before a blank line. Treat as the end
        // of the reasoning block; preserve this line (defensive against
        // malformed input where the blank-line terminator is missing).
        stripping = false
        out.push(line)
    }
    return out.join("\n")
}

/**
 * Strip the rendered reasoning block from HISTORICAL assistant messages
 * (every assistant message except the most recent one). Keeps the last
 * `maxHistoryReasoningTurns - 1` historical messages intact so the most
 * recent reasoning traces remain available to the model. The CURRENT
 * (most recent) assistant message is NEVER stripped — its reasoning is the
 * most relevant context for the next turn.
 *
 * Mutates `messages` in place. Non-assistant messages and assistant messages
 * without text parts are skipped. Text parts without a reasoning block are
 * returned byte-identical (the strip is a no-op for them).
 *
 * @param {Array<Record<string, unknown>>} messages - Hook output messages array (mutated).
 * @param {number} maxHistoryReasoningTurns - Positive integer; controls how many historical assistant turns KEEP their reasoning. `1` keeps only the current (no historical), `2` keeps current + 1 historical, etc.
 * @returns {void}
 */
function stripHistoryReasoning(messages, maxHistoryReasoningTurns) {
    if (!Array.isArray(messages) || messages.length === 0) return
    if (!Number.isInteger(maxHistoryReasoningTurns) || maxHistoryReasoningTurns <= 0) return

    /** @type {number[]} */
    const assistantIndices = []
    for (let i = 0; i < messages.length; i += 1) {
        const msg = messages[i]
        if (!msg || typeof msg !== "object") continue
        const info = /** @type {{role?: string}} */ (
            /** @type {{info?: {role?: unknown}}} */ (msg).info
        )
        if (info && info.role === "assistant") {
            assistantIndices.push(i)
        }
    }
    if (assistantIndices.length <= 1) return

    // The most recent assistant message is the "current" — never strip it.
    // The historical set is everything else; we keep the trailing
    // (maxHistoryReasoningTurns - 1) entries of that historical set.
    const keepHistorical = Math.max(0, maxHistoryReasoningTurns - 1)
    const stripUntil = Math.max(0, assistantIndices.length - 1 - keepHistorical)
    for (let i = 0; i < stripUntil; i += 1) {
        const msgIdx = assistantIndices[i]
        const msg = messages[msgIdx]
        if (!msg || typeof msg !== "object") continue
        const parts = /** @type {Array<unknown>} */ (/** @type {{parts?: unknown}} */ (msg).parts)
        if (!Array.isArray(parts)) continue
        for (const part of parts) {
            if (!part || typeof part !== "object") continue
            const objPart = /** @type {{type?: string, text?: string}} */ (part)
            if (objPart.type === "text" && typeof objPart.text === "string") {
                objPart.text = stripReasoningBlock(objPart.text)
            }
        }
    }
}

/**
 * v0.4.0+: directive string appended to `output.context` when
 * `config.compaction.stripReasoning === true`. OpenCode's compactor reads
 * each string in `output.context` and treats them as guidance for the
 * summary — this message asks it to discard rendered reasoning blocks
 * (`> ### ── ... ──` headers + their blockquote bodies) so the compacted
 * summary only carries the final response text, freeing context window
 * for new turns.
 *
 * The phrase "Discard all reasoning blocks" is asserted by the spec test
 * (test/compaction.test.js); the parenthetical describes the exact block
 * shape so the compactor knows which markdown construct to drop without
 * guessing.
 */
const COMPACTION_STRIP_REASONING_DIRECTIVE =
    "Discard all reasoning blocks (sections starting with '> ### ──' and continuing until the next blank line) before generating the compacted summary. Keep only the final response text."

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
 * v0.4.0+: when `config.stripHistory` is enabled, the
 * `experimental.chat.messages.transform` hook first strips the rendered
 * reasoning block from historical assistant messages BEFORE running the
 * per-message transform loop. This drops reasoning tokens from the
 * long-tail of the conversation without affecting the most recent turn.
 *
 * v0.4.0+: when `config.compaction.stripReasoning` is enabled, a second
 * hook `experimental.session.compacting` is registered alongside the
 * chat-messages transform. That hook receives `(input, output)` where
 * `output.context` is an array of directive strings; the plugin pushes a
 * single instruction that asks OpenCode's compactor to discard reasoning
 * blocks from the compacted summary.
 *
 * @param {Record<string, unknown> | undefined} _input - Plugin load input (unused; opencode-specific).
 * @param {import("../types/index.js").UserConfig | undefined} options - User config object.
 * @returns {Promise<Record<string, unknown>>} Plugin object with one or two hook implementations.
 */
export const ThinkSeparator = async (
    /** @type {Record<string, unknown> | undefined} */ _input,
    /** @type {import("../types/index.js").UserConfig | undefined} */ options
) => {
    const baseConfig = mergeConfig(options || {})
    /** @type {Record<string, unknown>} */
    const plugin = {
        "experimental.chat.messages.transform": async (
            /** @type {Record<string, unknown> | undefined} */ _hookInput,
            /** @type {{messages?: Array<Record<string, unknown>>} | undefined} */ output
        ) => {
            if (!output || !Array.isArray(output.messages)) return

            // History-pruning step (v0.4.0+): when enabled, remove the rendered
            // reasoning block from historical assistant messages BEFORE the
            // per-message transform loop runs. Done first so the per-message
            // loop sees clean input for stripped messages (no re-detection of
            // dropped reasoning). Defaults `maxHistoryReasoningTurns` to 1
            // when the user did not specify a positive integer.
            if (baseConfig.stripHistory === true) {
                const maxTurns =
                    baseConfig.maxHistoryReasoningTurns !== undefined
                        ? baseConfig.maxHistoryReasoningTurns
                        : 1
                stripHistoryReasoning(output.messages, maxTurns)
            }

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

    // Register the compaction hook ONLY when the user opts in. This keeps the
    // plugin's surface minimal and avoids surprising downstream consumers
    // that introspect the plugin object (only `experimental.chat.messages.transform`
    // is the v0.x contract; the compaction hook is v0.4.0+ opt-in).
    if (baseConfig.compaction?.stripReasoning === true) {
        plugin["experimental.session.compacting"] = async (
            /** @type {Record<string, unknown> | undefined} */ _hookInput,
            /** @type {{context?: Array<string>} | undefined} */ output
        ) => {
            if (!output || !Array.isArray(output.context)) return
            output.context.push(COMPACTION_STRIP_REASONING_DIRECTIVE)
        }
    }

    return plugin
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
