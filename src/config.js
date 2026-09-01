/**
 * Plugin configuration defaults and safe merge.
 *
 * Single config knob in v0.1.0: `label` (header text). Future versions may
 * add theme/style options — mergeConfig ignores unknown keys so older configs
 * keep working.
 */

/**
 * @typedef {Object} PluginConfig
 * @property {string} label - Header label shown above the reasoning block.
 */

/**
 * @typedef {Object} UserConfig
 * @property {string} [label] - Optional label override. If omitted, defaultConfig.label is used.
 */

/**
 * Frozen default plugin configuration. Returned as a fresh shallow copy by `mergeConfig`.
 * @type {PluginConfig}
 */
export const defaultConfig = Object.freeze({
    label: "Reasoning"
})

/**
 * Merge user-provided options with the frozen defaults.
 * Returns a new object on every call — never mutates `defaultConfig`.
 *
 * @param {UserConfig|undefined|null|*} userConfig
 * @returns {PluginConfig}
 */
export function mergeConfig(userConfig) {
    if (!userConfig || typeof userConfig !== "object") {
        return {...defaultConfig}
    }
    if (typeof userConfig.label !== "string" || userConfig.label.length === 0) {
        return {...defaultConfig}
    }
    return {label: userConfig.label}
}
