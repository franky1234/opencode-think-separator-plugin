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
 *
 * Reasoning metadata (duration, token count) is rendered as a header badge
 * when supplied — e.g. `> ### ── Reasoning (~1.2s, 450 tokens) ──`. When no
 * metadata is provided the header is byte-identical to v0.2.0.
 */

/**
 * Format a duration in milliseconds as a compact badge.
 *
 * - `ms < 1000`     → `"500ms"` (no `~` prefix; integer-style display)
 * - `ms < 60000`    → `"~1.2s"`  (one decimal; `~` prefix to signal approximation)
 * - `ms >= 60000`   → `"~1m 5s"` (`~` prefix; floor-rounded minutes/seconds)
 * - `null`, `undefined`, negative, or non-finite → empty string (defensive).
 *
 * The `~` prefix on sub-minute and minute units signals that the value is
 * rounded, while millisecond values are reported literally.
 *
 * @param {number|null|undefined} ms - Duration in milliseconds.
 * @returns {string} Formatted duration badge, or `""` if the value is unusable.
 *
 * @example
 * formatDuration(500)        // "500ms"
 * formatDuration(1200)       // "~1.2s"
 * formatDuration(65000)      // "~1m 5s"
 * formatDuration(null)       // ""
 * formatDuration(-1)         // ""
 */
export function formatDuration(ms) {
    if (ms === null || ms === undefined) return ""
    if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return ""
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `~${(ms / 1000).toFixed(1)}s`
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    return `~${minutes}m ${seconds}s`
}

/**
 * Format a token count as a compact badge.
 *
 * - `n === 1`        → `"1 token"`   (singular)
 * - `n !== 1`        → `"${n} tokens"` (plural, including `0`)
 * - `null`, `undefined`, negative, or non-finite → empty string (defensive).
 *
 * @param {number|null|undefined} n - Token count.
 * @returns {string} Formatted token badge, or `""` if the value is unusable.
 *
 * @example
 * formatTokens(0)    // "0 tokens"
 * formatTokens(1)    // "1 token"
 * formatTokens(450)  // "450 tokens"
 * formatTokens(null) // ""
 */
export function formatTokens(n) {
    if (n === null || n === undefined) return ""
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return ""
    return n === 1 ? "1 token" : `${n} tokens`
}

/**
 * Build the reasoning-block header line.
 *
 * When `metadata` is supplied and contains either `durationMs` or `tokens`,
 * the formatted values are appended as a badge between the label and the
 * closing em-dashes, e.g. `> ### ── Reasoning (~1.2s, 450 tokens) ──`.
 * Otherwise the header is byte-identical to v0.2.0.
 *
 * @param {string} label - Section label (caller is responsible for defaulting).
 * @param {{durationMs?: number, tokens?: number, budget?: number}} [metadata]
 *   Optional reasoning metadata. Only `durationMs` and `tokens` are surfaced
 *   in the badge; `budget` is reserved for future use and intentionally ignored.
 * @returns {string} The header formatted as `> ### ── ${label} ──` or
 *   `> ### ── ${label} (${badge}) ──` when at least one badge part is present.
 */
export function formatHeader(label, metadata) {
    const dur = formatDuration(metadata?.durationMs)
    const tok = formatTokens(metadata?.tokens)
    const parts = [dur, tok].filter((p) => p.length > 0)
    if (parts.length === 0) {
        return `> ### ── ${label} ──`
    }
    return `> ### ── ${label} (${parts.join(", ")}) ──`
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
 * Resolve a polymorphic second argument into a `{label, style, metadata}`
 * options object. Accepts a string (treated as the label, style and
 * metadata default), an object with `{label, style, metadata}`, or any
 * falsy value (defaults all three). Invalid styles fall back to `"markdown"`.
 *
 * @param {string|{label?: string, style?: string, metadata?: object}|undefined|null} optionsOrLabel
 * @returns {{label: string, style: string, metadata: object|undefined}}
 */
function normalizeOptions(optionsOrLabel) {
    if (typeof optionsOrLabel === "string") {
        return {label: optionsOrLabel, style: "markdown", metadata: undefined}
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
        const metadata =
            typeof optionsOrLabel.metadata === "object" && optionsOrLabel.metadata !== null
                ? optionsOrLabel.metadata
                : undefined
        return {label, style, metadata}
    }
    return {label: "Reasoning", style: "markdown", metadata: undefined}
}

/**
 * Render reasoning text as a GFM blockquote (italic body + em-dash header).
 * Backward-compatible equivalent of the v0.2.0 `renderReasoning` body.
 *
 * When `metadata` is supplied, a `(...)` badge is appended to the header.
 *
 * @param {string} reasoningText - Raw reasoning text (may contain newlines).
 * @param {string|undefined} label - Header label; falls back to "Reasoning".
 * @param {{durationMs?: number, tokens?: number, budget?: number}} [metadata]
 *   Optional reasoning metadata for header badge rendering.
 * @returns {string} Markdown block ending with `\n\n`.
 */
function renderMarkdownQuote(reasoningText, label, metadata) {
    const safeLabel = typeof label === "string" && label.length > 0 ? label : "Reasoning"
    const header = formatHeader(safeLabel, metadata)
    const body = reasoningText.split("\n").map(formatReasoningLine).join("\n")
    return `${header}\n${body}\n\n`
}

/**
 * Render reasoning text inside an HTML `<details>`/`<summary>` collapsible.
 * The label and the reasoning body are HTML-escaped to prevent injection.
 *
 * `metadata` is accepted for signature parity with the polymorphic dispatcher
 * but is intentionally ignored — the details style does not surface a badge.
 *
 * @param {string} reasoningText - Raw reasoning text (may contain newlines).
 * @param {string|undefined} label - Summary label; falls back to "Reasoning".
 * @param {object} [_metadata] - Ignored; present for dispatcher signature parity.
 * @returns {string} HTML block ending with `\n\n`.
 */
function renderHtmlDetails(reasoningText, label, _metadata) {
    const safeLabel = typeof label === "string" && label.length > 0 ? label : "Reasoning"
    return `<details><summary>${escapeHtml(safeLabel)}</summary>\n\n${escapeHtml(reasoningText)}\n\n</details>\n\n`
}

/**
 * Render reasoning text as an empty string — the reasoning block is dropped.
 * The trailing `\n\n` is kept so concatenating with the response block still
 * produces a single blank-line separator.
 *
 * `metadata` is accepted for signature parity with the polymorphic dispatcher
 * but is intentionally ignored.
 *
 * @param {string} [_reasoningText] - Ignored; present for dispatcher signature parity.
 * @param {string} [_label] - Ignored; present for dispatcher signature parity.
 * @param {object} [_metadata] - Ignored; present for dispatcher signature parity.
 * @returns {string} Empty string.
 */
function renderStrip(_reasoningText, _label, _metadata) {
    return ""
}

/**
 * Render reasoning text as-is (no decoration, no transformation). The label
 * and metadata are intentionally ignored — `raw` is meant for callers who want
 * the bare reasoning text with zero styling.
 *
 * @param {string} reasoningText - Raw reasoning text.
 * @param {string} [_label] - Ignored; present for dispatcher signature parity.
 * @param {object} [_metadata] - Ignored; present for dispatcher signature parity.
 * @returns {string} Reasoning text followed by a blank-line separator.
 */
function renderRaw(reasoningText, _label, _metadata) {
    return `${reasoningText}\n\n`
}

/**
 * Strategy map: style name → render function. Frozen so consumers cannot
 * accidentally mutate the dispatch table at runtime.
 * @type {Readonly<Record<string, (reasoningText: string, label?: string, metadata?: object) => string>>}
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
 * - `string`                       → label only; style + metadata default (backward-compat).
 * - `{label, style, metadata}`     → all knobs; invalid `style` silently falls back to `"markdown"`.
 * - `undefined | null`             → defaults: label `"Reasoning"`, style `"markdown"`, no metadata.
 *
 * The optional 3rd argument `metadata` is forwarded to the chosen renderer.
 * Only the `markdown` renderer currently surfaces it (header decoration); the
 * other styles ignore it but accept the parameter for dispatcher uniformity.
 *
 * @param {string} reasoningText - Raw reasoning text (may contain newlines).
 * @param {string|{label?: string, style?: string, metadata?: object}|undefined|null} [optionsOrLabel]
 *   Either a label string (backward-compat) or an options object.
 * @param {{durationMs?: number, tokens?: number, budget?: number}} [metadata]
 *   Optional reasoning metadata forwarded to the renderer. When `optionsOrLabel`
 *   is an object, its `metadata` field takes precedence over this argument.
 * @returns {string} Rendered reasoning block; the trailing `\n\n` separator is preserved across all styles.
 */
export function renderReasoning(reasoningText, optionsOrLabel, metadata) {
    const {label, style, metadata: optionsMetadata} = normalizeOptions(optionsOrLabel)
    const effectiveMetadata = optionsMetadata !== undefined ? optionsMetadata : metadata
    const renderer = RENDER_STYLES[style] || renderMarkdownQuote
    return renderer(reasoningText, label, effectiveMetadata)
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
