/**
 * Plugin configuration defaults and safe merge.
 *
 * Two config knobs in v0.3.0:
 * - `label` (header text)
 * - `style` (render style — `markdown` | `details` | `strip` | `raw`)
 *
 * Forward-compat: mergeConfig ignores unknown keys so older configs keep working.
 */

/**
 * @typedef {("markdown"|"details"|"strip"|"raw")} RenderStyle
 *   How the reasoning block is rendered before the final response.
 *   - `markdown` (default) — GFM blockquote with italic body + header
 *   - `details`           — HTML `<details>`/`<summary>` collapsible
 *   - `strip`             — drops the reasoning block entirely (renders as empty string)
 *   - `raw`               — pass-through of the raw reasoning text, no decoration
 */

/**
 * @typedef {Object} PluginConfig
 * @property {string} label - Header label shown above the reasoning block.
 * @property {RenderStyle} style - Render style for the reasoning block.
 */

/**
 * @typedef {Object} UserConfig
 * @property {string} [label] - Optional label override. If omitted, defaultConfig.label is used.
 * @property {RenderStyle} [style] - Optional render-style override. Unknown values silently fall back to the default (`markdown`).
 */

/**
 * Module-private whitelist of allowed render styles. Forward-compat: any value
 * not in this set is treated as an unknown key and falls back to the default.
 * @type {ReadonlyArray<RenderStyle>}
 */
const ALLOWED_STYLES = Object.freeze(["markdown", "details", "strip", "raw"])

/**
 * Frozen default plugin configuration. Returned as a fresh shallow copy by `mergeConfig`.
 * @type {PluginConfig}
 */
export const defaultConfig = Object.freeze({
    label: "Reasoning",
    style: "markdown"
})

/**
 * Merge user-provided options with the frozen defaults.
 * Returns a new object on every call — never mutates `defaultConfig`.
 *
 * Unknown `style` values silently fall back to `"markdown"` (forward-compat,
 * matches the existing label handling).
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

    if (!hasValidLabel && !hasValidStyle) {
        return {...defaultConfig}
    }

    return {
        label: hasValidLabel ? userConfig.label : defaultConfig.label,
        style: hasValidStyle ? userConfig.style : defaultConfig.style
    }
}
