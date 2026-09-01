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
 * Cached reference to `createReasoningStreamParser` from `./stream.js`.
 *
 * `./stream.js` will be introduced in Phase 4 (Task 4) of the v2 upgrade
 * with the streaming chunk parser FSM. Until that file exists, importing
 * it eagerly would throw `ERR_MODULE_NOT_FOUND` at load time. The dynamic
 * import inside `createReasoningStreamParser` (below) defers resolution
 * to first call and caches the resolved factory here.
 *
 * @type {((options?: Record<string, unknown>) => import("../types/index.js").ReasoningStreamParser) | null}
 */
let _createReasoningStreamParser = null

/**
 * Factory for the streaming chunk parser (Phase 4 / Task 4 of v2).
 *
 * Each invocation returns a fresh, isolated finite-state-machine instance
 * that buffers partial XML reasoning tags across chunk boundaries. Safe to
 * use with SSE, WebSocket, and Vercel AI SDK streams where chunks may
 * split a tag like `<think>` between two payloads.
 *
 * Implementation note: this wrapper exists because `./stream.js` is added
 * in a later phase of the v2 upgrade. The first call performs a one-time
 * dynamic `import("./stream.js")` and caches the resolved factory;
 * subsequent calls reuse the cached reference.
 *
 * @param {Record<string, unknown>} [options] - Optional factory options
 *   (final shape is defined in `./stream.js`).
 * @returns {Promise<import("../types/index.js").ReasoningStreamParser>} A fresh parser instance.
 * @throws {Error} If `./stream.js` is not yet available on disk (Phase 4 not merged).
 */
export async function createReasoningStreamParser(options) {
    if (_createReasoningStreamParser === null) {
        // @ts-expect-error -- ./stream.js is added by Phase 4 / Task 4 of the v2 upgrade;
        // remove this suppression once that file exists.
        const mod = await import("./stream.js")
        _createReasoningStreamParser = mod.createReasoningStreamParser
    }
    const factory =
        /** @type {(options?: Record<string, unknown>) => import("../types/index.js").ReasoningStreamParser} */ (
            _createReasoningStreamParser
        )
    return factory(options)
}
