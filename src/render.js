/**
 * Strategy-Pattern renderer for reasoning + response blocks.
 *
 * Four render styles are exposed via the frozen `RENDER_STYLES` map:
 * - `markdown` — GFM blockquote with header + italic body (default; preserved from v0.x)
 * - `details`  — HTML `<details>`/`<summary>` collapsible (HTML-escaped)
 * - `strip`    — drops the reasoning block entirely (renders as empty string)
 * - `raw`      — pass-through of the raw reasoning text, no decoration
 *
 * Public API is backward compatible: `renderReasoning(text, stringLabel)` still
 * produces the same markdown output as v0.2.0.
 */

/**
 * Build the reasoning-block header line.
 * @param {string} label - Section label (caller is responsible for defaulting).
 * @returns {string} The header formatted as `> ### ── ${label} ──`.
 */
export function formatHeader(label) {
    return `> ### ── ${label} ──`
}

/**
 * Format a single line of reasoning body text.
 * @param {string} line - Raw line from the reasoning text.
 * @returns {string} The line as `> *${line}*` when non-blank, or `>` when blank.
 */
export function formatReasoningLine(line) {
    return line.trim().length > 0 ? `> *${line}*` : ">"
}

/**
 * Escape the five HTML-significant characters so the result is safe to embed
 * inside HTML element bodies and attribute values.
 * @param {string} value - Raw text to escape.
 * @returns {string} HTML-safe text.
 */
function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
}

/**
 * Resolve a polymorphic second argument into a `{label, style}` options object.
 * Accepts a string (treated as the label, style defaults to `"markdown"`),
 * an object with `{label, style}`, or any falsy value (defaults both).
 * Invalid styles fall back to `"markdown"`.
 *
 * @param {string|{label?: string, style?: string}|undefined|null} optionsOrLabel
 * @returns {{label: string, style: string}}
 */
function normalizeOptions(optionsOrLabel) {
    if (typeof optionsOrLabel === "string") {
        return {label: optionsOrLabel, style: "markdown"}
    }
    if (optionsOrLabel && typeof optionsOrLabel === "object") {
        const label =
            typeof optionsOrLabel.label === "string" && optionsOrLabel.label.length > 0
                ? optionsOrLabel.label
                : "Reasoning"
        const style =
            typeof optionsOrLabel.style === "string" &&
            Object.prototype.hasOwnProperty.call(RENDER_STYLES, optionsOrLabel.style)
                ? optionsOrLabel.style
                : "markdown"
        return {label, style}
    }
    return {label: "Reasoning", style: "markdown"}
}

/**
 * Render reasoning text as a GFM blockquote (italic body + em-dash header).
 * Backward-compatible equivalent of the v0.2.0 `renderReasoning` body.
 *
 * @param {string} reasoningText - Raw reasoning text (may contain newlines).
 * @param {string|undefined} label - Header label; falls back to "Reasoning".
 * @returns {string} Markdown block ending with `\n\n`.
 */
function renderMarkdownQuote(reasoningText, label) {
    const safeLabel = typeof label === "string" && label.length > 0 ? label : "Reasoning"
    const header = formatHeader(safeLabel)
    const body = reasoningText.split("\n").map(formatReasoningLine).join("\n")
    return `${header}\n${body}\n\n`
}

/**
 * Render reasoning text inside an HTML `<details>`/`<summary>` collapsible.
 * The label and the reasoning body are HTML-escaped to prevent injection.
 *
 * @param {string} reasoningText - Raw reasoning text (may contain newlines).
 * @param {string|undefined} label - Summary label; falls back to "Reasoning".
 * @returns {string} HTML block ending with `\n\n`.
 */
function renderHtmlDetails(reasoningText, label) {
    const safeLabel = typeof label === "string" && label.length > 0 ? label : "Reasoning"
    return `<details><summary>${escapeHtml(safeLabel)}</summary>\n\n${escapeHtml(reasoningText)}\n\n</details>\n\n`
}

/**
 * Render reasoning text as an empty string — the reasoning block is dropped.
 * The trailing `\n\n` is kept so concatenating with the response block still
 * produces a single blank-line separator.
 *
 * @returns {string} Empty string ending with `\n\n`.
 */
function renderStrip() {
    return ""
}

/**
 * Render reasoning text as-is (no decoration, no transformation). The label
 * is intentionally ignored — `raw` is meant for callers who want the bare
 * reasoning text with zero styling.
 *
 * @param {string} reasoningText - Raw reasoning text.
 * @returns {string} Reasoning text followed by a blank-line separator.
 */
function renderRaw(reasoningText) {
    return `${reasoningText}\n\n`
}

/**
 * Strategy map: style name → render function. Frozen so consumers cannot
 * accidentally mutate the dispatch table at runtime.
 * @type {Readonly<Record<string, (reasoningText: string, label?: string) => string>>}
 */
export const RENDER_STYLES = Object.freeze({
    markdown: renderMarkdownQuote,
    details: renderHtmlDetails,
    strip: renderStrip,
    raw: renderRaw
})

/**
 * Render a reasoning block using the requested style.
 *
 * Polymorphic second argument:
 * - `string`             → label only; style defaults to `"markdown"` (backward-compat).
 * - `{label, style}`     → both knobs; invalid `style` silently falls back to `"markdown"`.
 * - `undefined | null`   → defaults: label `"Reasoning"`, style `"markdown"`.
 *
 * @param {string} reasoningText - Raw reasoning text (may contain newlines).
 * @param {string|{label?: string, style?: string}|undefined|null} [optionsOrLabel]
 *   Either a label string (backward-compat) or an options object.
 * @returns {string} Rendered reasoning block; the trailing `\n\n` separator is preserved across all styles.
 */
export function renderReasoning(reasoningText, optionsOrLabel) {
    const {label, style} = normalizeOptions(optionsOrLabel)
    const renderer = RENDER_STYLES[style] || renderMarkdownQuote
    return renderer(reasoningText, label)
}

/**
 * Indent each line of the response text with two leading spaces (matches reasoning indent).
 * @param {string} responseText - Raw response text (may contain newlines).
 * @returns {string} Indented response text (no trailing newline).
 */
export function renderResponse(responseText) {
    return responseText
        .split("\n")
        .map((line) => `  ${line}`)
        .join("\n")
}

/**
 * Combine the reasoning block and the response block into a single markdown string.
 * Uses the default markdown style — `compose` does not currently accept a style knob
 * (callers needing per-call style should call `renderReasoning` + `renderResponse` directly).
 *
 * @param {{reasoning: string}} detection - Detection result (only `reasoning` is read).
 * @param {string} responseText - Raw response text.
 * @param {string|undefined} label - Optional label forwarded to `renderReasoning`.
 * @returns {string} Reasoning block immediately followed by indented response block.
 */
export function compose(detection, responseText, label) {
    return renderReasoning(detection.reasoning, label) + renderResponse(responseText)
}
