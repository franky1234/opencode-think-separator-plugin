/**
 * opencode-think-separator-plugin — pure-agnostic core API gateway.
 *
 * This module is a thin re-export surface that exposes the plugin's logic
 * without any OpenCode-specific glue. It implements the Adapter Pattern:
 *
 *   - `src/core.js` (this file) — pure, framework-agnostic API.
 *     Anything that wants to reuse the reasoning-detection, rendering,
 *     streaming-parse, or configuration primitives in a non-OpenCode host
 *     (e.g. a custom CLI tool, a docs builder, a chat UI shell) imports
 *     from here.
 *
 *   - `src/index.js` — OpenCode adapter. Imports the leaf modules and wires
 *     them into the `experimental.chat.messages.transform` hook. Downstream
 *     consumers of the package reach the public API via the package's
 *     `"."` export (`./src/index.js`).
 *
 * Architectural rule: `src/core.js` MUST stay free of OpenCode hook imports,
 * plugin metadata (`id`, `server`), or any side effects. Loading this module
 * must never instantiate or reference OpenCode-specific code paths.
 *
 * Leaf modules remain the single source of truth — `src/core.js` only
 * re-exports. Adding a new export means adding it in the leaf module first
 * and then re-exporting here.
 */

import {createReasoningStreamParser as _createReasoningStreamParser} from "./stream.js"

/**
 * Extracts reasoning blocks found inside XML-like tags (e.g. <think>...</think>)
 * from a text string. Handles closed tags, unclosed tags at the end of text,
 * and orphan opening/closing tags.
 *
 * Re-exported from `./detect-reasoning.js`. See that module for full contract.
 *
 * @param {string} text
 * @returns {{ reasoningTexts: string[], cleanText: string }}
 */
export {extractReasoningFromText} from "./detect-reasoning.js"

/**
 * Runs the detection strategies in priority order and returns the first match.
 * Returns `null` when the message is invalid or no strategy detects reasoning.
 *
 * Re-exported from `./detect-reasoning.js`. See that module for full contract.
 *
 * @param {Record<string, unknown> | null | undefined} message
 * @returns {{reasoning: string, source: string, kind: string} | null}
 */
export {detectReasoning} from "./detect-reasoning.js"

/**
 * Compose the full reasoning block: header + quoted body + trailing blank-line
 * separator. Output is GitHub-Flavored Markdown that renders correctly in any
 * TUI/theme supporting GFM.
 *
 * Re-exported from `./render.js`. See that module for full contract.
 *
 * @param {string} reasoningText - Raw reasoning text (may contain newlines).
 * @param {string|undefined} label - Optional label; falls back to "Reasoning".
 * @returns {string} Markdown block ending with `\n\n`.
 */
export {renderReasoning} from "./render.js"

/**
 * Frozen default plugin configuration. Returned as a fresh shallow copy by `mergeConfig`.
 *
 * Re-exported from `./config.js`. See that module for full contract.
 *
 * @type {import("../types/index.js").PluginConfig}
 */
export {defaultConfig} from "./config.js"

/**
 * Merge user-provided options with the frozen defaults. Returns a new object
 * on every call — never mutates `defaultConfig`. Unknown keys are ignored so
 * older configs keep working.
 *
 * Re-exported from `./config.js`. See that module for full contract.
 *
 * @param {import("../types/index.js").UserConfig | undefined | null} userConfig
 * @returns {import("../types/index.js").PluginConfig}
 */
export {mergeConfig} from "./config.js"

/**
 * Resolve the effective plugin config for a given model id, applying any
 * matching entry in `baseConfig.models` as an override on top of the base
 * `{label, style}` fields.
 *
 * Re-exported from `./config.js`. See that module for full contract.
 *
 * @param {string|null|undefined} modelId
 * @param {import("../types/index.js").PluginConfig} baseConfig
 * @returns {import("../types/index.js").PluginConfig}
 */
export {resolveModelConfig} from "./config.js"

/**
 * Compile a memoized 3-phase regex set for a given list of reasoning tag
 * names. Used by `extractReasoningFromText` and `detectReasoning` to scan
 * provider output for embedded XML reasoning blocks. The result is cached
 * per input array reference, so repeated calls with the frozen default tag
 * list hit the cache.
 *
 * Re-exported from `./detect-reasoning.js`. See that module for full contract.
 *
 * @param {ReadonlyArray<string>} tags
 * @returns {{CLOSED: RegExp, UNCLOSED: RegExp, ORPHAN: RegExp}}
 */
export {compileReasoningTagRegex} from "./detect-reasoning.js"

/**
 * Pull well-formed thinking-metadata fields (`thinking_duration_ms`,
 * `thinking_budget`, `thinking_tokens`) off a message. Returns `undefined`
 * when no field is usable, otherwise a partial object with the supplied keys.
 *
 * Re-exported from `./detect-reasoning.js`. See that module for full contract.
 *
 * @param {Record<string, unknown> | null | undefined} message
 * @returns {{durationMs?: number, budget?: number, tokens?: number} | undefined}
 */
export {extractMetadata} from "./detect-reasoning.js"

/**
 * Format a duration in milliseconds as a compact badge (`500ms` / `~1.2s` /
 * `~1m 5s`). Returns `""` for nullish, negative, or non-finite input.
 *
 * Re-exported from `./render.js`. See that module for full contract.
 *
 * @param {number|null|undefined} ms
 * @returns {string}
 */
export {formatDuration} from "./render.js"

/**
 * Format a token count as a compact badge (`1 token` / `450 tokens`). Returns
 * `""` for nullish, negative, or non-finite input.
 *
 * Re-exported from `./render.js`. See that module for full contract.
 *
 * @param {number|null|undefined} n
 * @returns {string}
 */
export {formatTokens} from "./render.js"

/**
 * Factory for the streaming chunk parser (Phase 4 / Task 4 of v2).
 *
 * Each invocation returns a fresh, isolated finite-state-machine instance
 * that buffers partial XML reasoning tags across chunk boundaries. Safe to
 * use with SSE, WebSocket, and Vercel AI SDK streams where chunks may
 * split a tag like `<think>` between two payloads.
 *
 * Implementation note: the factory itself in `./stream.js` is sync; this
 * wrapper is kept `async` so the public `core` surface preserves its
 * `Promise<ReasoningStreamParser>` signature. Callers should still `await`
 * the result (the await is a microtask hop, not a real load-time cost).
 *
 * Re-exported from `./stream.js`. See that module for full contract.
 *
 * @param {Record<string, unknown>} [options] - Optional factory options
 *   (final shape is defined in `./stream.js`).
 * @returns {Promise<import("../types/index.js").ReasoningStreamParser>} A fresh parser instance.
 */
export async function createReasoningStreamParser(options) {
    return _createReasoningStreamParser(options)
}
