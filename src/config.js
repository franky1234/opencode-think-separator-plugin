/**
 * Plugin configuration defaults and safe merge.
 *
 * Config knobs in v0.4.0+:
 * - `label`      (header text)
 * - `style`      (render style — `markdown` | `details` | `strip` | `raw` | `quote` | `compact`)
 * - `maxLines`   (positive integer; truncates reasoning before rendering)
 * - `models`     (per-model overrides — optional, see `resolveModelConfig`)
 * - `customTags` (extra XML reasoning tags — optional, passed to detector)
 *
 * Forward-compat: mergeConfig ignores unknown keys so older configs keep working.
 */

/**
 * @typedef {("markdown"|"details"|"strip"|"raw"|"quote"|"compact")} RenderStyle
 *   How the reasoning block is rendered before the final response.
 *   - `markdown` (default) — GFM blockquote with italic body + header
 *   - `details`           — HTML `<details>`/`<summary>` collapsible
 *   - `strip`             — drops the reasoning block entirely (renders as empty string)
 *   - `raw`               — pass-through of the raw reasoning text, no decoration
 *   - `quote`             — clean blockquote (same shape as `markdown`, NO italic wrapping)
 *   - `compact`           — one-line header with line-count badge + first-line preview
 */

/**
 * @typedef {Object} ModelConfigOverride
 * @property {RenderStyle} [style] - Render-style override applied when the model pattern matches.
 * @property {string}      [label] - Header-label override applied when the model pattern matches.
 * @property {number}      [maxLines] - Per-model maxLines override; must be a positive integer to take effect.
 */

/**
 * @typedef {Object} ModelConfigMap
 * @property {ModelConfigOverride} [key] - Pattern → override. Pattern is either an
 *   exact model id (`"deepseek/v4-pro"`) or a prefix wildcard ending in `/*`
 *   (`"deepseek/*"` matches any model id starting with `"deepseek/"`). Patterns
 *   that do not end in `/*` are matched by exact equality (safer suffix wildcards
 *   are not supported — see `resolveModelConfig`).
 */

/**
 * @typedef {string} ModelOverridePattern
 *   Glob pattern used to match a model id. Either an exact id
 *   (`"deepseek/v4-pro"`) or a prefix wildcard ending in `/*`
 *   (`"deepseek/*"`). Patterns with `*` elsewhere fall back to exact matching.
 */

/**
 * @typedef {Object} PluginConfig
 * @property {string}           label - Header label shown above the reasoning block.
 * @property {RenderStyle}      style - Render style for the reasoning block.
 * @property {number}           [maxLines] - Maximum lines to retain before rendering; absent when user did not set it.
 * @property {ModelConfigMap}   [models]     - Per-model override map. Omitted when user did not provide any.
 * @property {ReadonlyArray<string>} [customTags] - Extra XML tag names recognised by the detector. Omitted when user did not provide any.
 */

/**
 * @typedef {Object} UserConfig
 * @property {string}      [label] - Optional label override. If omitted, defaultConfig.label is used.
 * @property {RenderStyle} [style] - Optional render-style override. Unknown values silently fall back to the default (`markdown`).
 * @property {number}      [maxLines] - Optional maxLines override. Must be a positive integer; otherwise silently dropped.
 * @property {ModelConfigMap} [models] - Optional per-model override map. Must be a plain object; otherwise silently dropped.
 * @property {ReadonlyArray<string>} [customTags] - Optional extra XML tag names. Must be an array of strings; otherwise silently dropped.
 */

/**
 * Module-private whitelist of allowed render styles. Forward-compat: any value
 * not in this set is treated as an unknown key and falls back to the default.
 * @type {ReadonlyArray<RenderStyle>}
 */
const ALLOWED_STYLES = Object.freeze(["markdown", "details", "strip", "raw", "quote", "compact"])

/**
 * Module-private default for `maxLines`. There is no built-in ceiling — users
 * opt in by providing a positive integer.
 * @type {number|undefined}
 */
const DEFAULT_MAX_LINES = undefined

/**
 * Validate and return a user-provided `maxLines` value. Returns `undefined`
 * when the input is not a positive integer (defensive drop). Floats,
 * negative numbers, zero, NaN, Infinity, strings, and `null` all drop.
 *
 * @param {*} value
 * @returns {number|undefined}
 */
function sanitizeMaxLines(value) {
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
        return undefined
    }
    return value
}

/**
 * Frozen default plugin configuration. Returned as a fresh shallow copy by `mergeConfig`.
 * Intentionally does NOT carry `models` or `customTags` — those are opt-in and
 * only present in the returned config when the user actually supplied them.
 * @type {PluginConfig}
 */
export const defaultConfig = Object.freeze({
    label: "Reasoning",
    style: "markdown"
})

/**
 * Validate and return a user-provided `models` map. Returns `undefined` when
 * the input is not a plain object (forward-compat silent drop). Per-entry
 * validation is delegated to `resolveModelConfig` — this function only checks
 * the top-level shape so mergeConfig stays simple.
 *
 * @param {unknown} value
 * @returns {ModelConfigMap | undefined}
 */
function sanitizeModels(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return undefined
    }
    const out = /** @type {ModelConfigMap} */ (/** @type {unknown} */ (value))
    return out
}

/**
 * Validate and return a user-provided `customTags` array. Returns `undefined`
 * when the input is not an array of strings (forward-compat silent drop).
 * Empty arrays are preserved as `[]` so callers can distinguish "user opted
 * in with no tags" from "user did not provide the field".
 *
 * @param {unknown} value
 * @returns {ReadonlyArray<string> | undefined}
 */
function sanitizeCustomTags(value) {
    if (!Array.isArray(value)) {
        return undefined
    }
    const filtered = value.filter((t) => typeof t === "string" && t.length > 0)
    return Object.freeze(filtered)
}

/**
 * Merge user-provided options with the frozen defaults.
 * Returns a new object on every call — never mutates `defaultConfig`.
 *
 * Unknown `style` values silently fall back to `"markdown"` (forward-compat,
 * matches the existing label handling). `models`, `customTags`, and `maxLines`
 * are OMITTED from the returned config when the user did not provide a valid
 * value for them — this keeps `mergeConfig({})` deepEqual to `defaultConfig`
 * for back-compat.
 *
 * @param {UserConfig|undefined|null|*} userConfig
 * @returns {PluginConfig}
 */
export function mergeConfig(userConfig) {
    if (!userConfig || typeof userConfig !== "object") {
        return {...defaultConfig}
    }

    const hasValidLabel = typeof userConfig.label === "string" && userConfig.label.length > 0
    const hasValidStyle =
        typeof userConfig.style === "string" &&
        ALLOWED_STYLES.includes(/** @type {RenderStyle} */ (userConfig.style))

    const models = sanitizeModels(userConfig.models)
    const customTags = sanitizeCustomTags(userConfig.customTags)
    const maxLines = sanitizeMaxLines(userConfig.maxLines)

    const hasModels = models !== undefined && Object.keys(models).length > 0
    const hasCustomTags = customTags !== undefined && customTags.length > 0
    const hasMaxLines = maxLines !== undefined

    if (!hasValidLabel && !hasValidStyle && !hasModels && !hasCustomTags && !hasMaxLines) {
        return {...defaultConfig}
    }

    /** @type {PluginConfig} */
    const out = {
        label: hasValidLabel ? userConfig.label : defaultConfig.label,
        style: hasValidStyle ? userConfig.style : defaultConfig.style
    }
    if (hasMaxLines) {
        out.maxLines = maxLines
    }
    if (hasModels) {
        out.models = models
    }
    if (hasCustomTags) {
        out.customTags = customTags
    }
    return out
}

/**
 * Match a single model id against a pattern. A pattern ending in `slash-star`
 * is treated as a prefix wildcard: split on `/`, if the last segment is `*`,
 * every preceding segment must match the model's id segments exactly.
 * Patterns with `*` in any other position (e.g. `star-slash-claude`) fall
 * back to exact-equality matching — keeps the parser total and crash-free.
 *
 * @param {string} pattern
 * @param {string} modelId
 * @returns {boolean}
 */
function patternMatches(pattern, modelId) {
    if (typeof pattern !== "string" || typeof modelId !== "string") {
        return false
    }
    if (pattern === modelId) {
        return true
    }
    if (!pattern.endsWith("/*")) {
        return false
    }
    const prefix = pattern.slice(0, -2) // strip the trailing "/*"
    // Prefix wildcard: modelId must start with `prefix + "/"` (so "deepseek/*"
    // matches "deepseek/v4-pro" but NOT "deepseek").
    if (modelId === prefix) {
        return false
    }
    return modelId.startsWith(`${prefix}/`)
}

/**
 * Resolve the effective plugin config for a given model id.
 *
 * Iterates `baseConfig.models` in insertion order and applies the FIRST
 * pattern that matches the model id (first-match-wins). When the override
 * provides `label`, `style`, and/or `maxLines`, those replace the base
 * values; invalid fields fall back to the base, absent fields fall back to
 * the base. `models` and `customTags` are passed through unchanged so the
 * resolved config is still usable downstream.
 *
 * Returns `baseConfig` as-is when no override matches or when `modelId` is
 * missing / non-string. Consistent with `mergeConfig`'s immutability: the
 * returned object is either `baseConfig` itself or a fresh shallow copy.
 *
 * @param {string|null|undefined} modelId
 * @param {PluginConfig} baseConfig
 * @returns {PluginConfig}
 */
export function resolveModelConfig(modelId, baseConfig) {
    if (typeof modelId !== "string" || modelId.length === 0) {
        return baseConfig
    }
    const map = baseConfig.models
    if (!map || typeof map !== "object") {
        return baseConfig
    }
    /** @type {Record<string, ModelConfigOverride>} */
    const typedMap = /** @type {*} */ (map)
    /** @type {string[]} */
    const patterns = Object.keys(typedMap)
    for (let i = 0; i < patterns.length; i += 1) {
        const pattern = patterns[i]
        if (!patternMatches(pattern, modelId)) {
            continue
        }
        const override = typedMap[pattern]
        if (!override || typeof override !== "object") {
            continue
        }
        const overrideMaxLines = sanitizeMaxLines(override.maxLines)
        const effectiveMaxLines =
            overrideMaxLines !== undefined ? overrideMaxLines : baseConfig.maxLines
        /** @type {PluginConfig} */
        const resolved = {
            label: typeof override.label === "string" ? override.label : baseConfig.label,
            style:
                typeof override.style === "string" &&
                ALLOWED_STYLES.includes(/** @type {RenderStyle} */ (override.style))
                    ? override.style
                    : baseConfig.style
        }
        if (effectiveMaxLines !== undefined) {
            resolved.maxLines = effectiveMaxLines
        }
        if (baseConfig.models) {
            resolved.models = baseConfig.models
        }
        if (baseConfig.customTags) {
            resolved.customTags = baseConfig.customTags
        }
        return resolved
    }
    return baseConfig
}
