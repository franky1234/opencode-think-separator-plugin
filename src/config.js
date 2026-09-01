/**
 * Plugin configuration defaults and safe merge.
 *
 * Single config knob in v0.1.0: `label` (header text). Future versions may
 * add theme/style options — mergeConfig ignores unknown keys so older configs
 * keep working.
 */

export const defaultConfig = Object.freeze({
    label: "Reasoning"
})

export function mergeConfig(userConfig) {
    const out = {...defaultConfig}
    if (userConfig && typeof userConfig === "object") {
        if (typeof userConfig.label === "string" && userConfig.label.length > 0) {
            out.label = userConfig.label
        }
    }
    return out
}
