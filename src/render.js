/**
 * Strategy-Pattern renderer for reasoning + response blocks.
 *
 * Six render styles are exposed via the frozen `RENDER_STYLES` map:
 * - `markdown` (default; preserved from v0.x) — GFM blockquote with header + italic body
 * - `details`                                — HTML `<details>`/`<summary>` collapsible (HTML-escaped)
 * - `strip`                                  — drops the reasoning block entirely (renders as empty string)
 * - `raw`                                    — pass-through of the raw reasoning text, no decoration
 * - `quote`                                  — clean blockquote (same shape as `markdown`, NO italic wrapping)
 * - `compact`                                — one-line header with line-count badge + first-line preview
 *
 * Public API is backward compatible: `renderReasoning(text, stringLabel)` still
 * produces the same markdown output as v0.2.0.
 *
 * Reasoning metadata (duration, token count) is rendered as a header badge
 * when supplied — e.g. `> ### ── Reasoning (~1.2s, 450 tokens) ──`. When no
 * metadata is provided the header is byte-identical to v0.2.0.
 *
 * `maxLines` truncates the reasoning text before rendering, appending a plain
 * `... [+N lines of reasoning truncated]...` indicator that the chosen renderer
 * decorates to match its style (e.g. `> *... [+N lines of reasoning truncated]...*`
 * under `markdown`, `> ... [+N lines of reasoning truncated]...` under `quote`).
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
 * Format a single line of reasoning body text as a blockquoted italic.
 *
 * Intended for plain paragraph lines only. Lines inside fenced code blocks
 * or markdown list items must NOT be passed through this helper — they are
 * formatted verbatim by `renderMarkdownBody` so that indentation, fence
 * markers, and list syntax survive the blockquote wrapping.
 *
 * @param {string} line - Raw line from the reasoning text.
 * @returns {string} The line as `> *${line}*` when non-blank, or `>` when blank.
 */
export function formatReasoningLine(line) {
    return line.trim().length > 0 ? `> *${line}*` : ">"
}

/**
 * Heuristic matcher for the first non-blank character of a markdown list item.
 * Matches ordered (`1. `, `2) `) and unordered (`- `, `* `, `+ `) markers.
 * @param {string} trimmed - Already `.trim()`-ed line.
 * @returns {boolean} True when the line begins with a recognised list marker.
 */
function isListLine(trimmed) {
    if (trimmed.length === 0) return false
    const first = trimmed[0]
    if (first === "-" || first === "*" || first === "+") {
        return trimmed.length > 1 && trimmed[1] === " "
    }
    if (first >= "0" && first <= "9") {
        const dotIdx = trimmed.indexOf(". ")
        const parenIdx = trimmed.indexOf(") ")
        const closeIdx =
            dotIdx >= 0 && parenIdx >= 0 ? Math.min(dotIdx, parenIdx) : Math.max(dotIdx, parenIdx)
        return closeIdx > 0
    }
    return false
}

/**
 * Format pre-split lines of reasoning text as a blockquote, preserving code
 * fences, indentation, and list syntax. Shared by the `markdown` and `quote`
 * render styles — the only difference between them is whether plain paragraph
 * lines get italic asterisk wrapping (`markdown` → `formatReasoningLine`) or
 * pass through as `> ${line}` (`quote`).
 *
 * Lines inside a fenced code block (` ``` ` or `~~~`) are wrapped as
 * `> ${line}` with their original leading whitespace so indentation survives.
 * Markdown list items also pass through verbatim to keep the list marker at
 * column 0 of the quoted content. Blank lines emit a bare `>` to maintain
 * the blockquote structure.
 *
 * @param {string[]} lines - Lines of reasoning text (already split on `\n`).
 * @param {{italicParagraphs?: boolean}} [options]
 * @returns {string[]} The blockquoted lines, ready to be joined with `\n`.
 */
function formatLinesAsBlockquote(lines, {italicParagraphs = false} = {}) {
    let inCodeFence = false
    /** @type {string[]} */
    const out = []
    for (const rawLine of lines) {
        const trimmed = rawLine.trim()
        if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
            inCodeFence = !inCodeFence
            out.push(`> ${rawLine}`)
            continue
        }
        if (inCodeFence) {
            out.push(`> ${rawLine}`)
            continue
        }
        if (trimmed.length === 0) {
            out.push(">")
            continue
        }
        if (isListLine(trimmed)) {
            out.push(`> ${rawLine}`)
            continue
        }
        out.push(italicParagraphs ? formatReasoningLine(rawLine) : `> ${rawLine}`)
    }
    return out
}

/**
 * Render the body of a markdown reasoning blockquote, preserving code fences,
 * indentation, and list syntax. Lines inside a fenced code block (` ``` ` or
 * `~~~`) are wrapped as `> ${line}` with their original leading whitespace
 * so indentation survives. Markdown list items are also passed through
 * verbatim to keep the list marker at column 0 of the quoted content.
 * Paragraph lines keep the legacy `> *${line.trim()}*` italic styling.
 *
 * @param {string} reasoningText - Raw reasoning text (may contain newlines).
 * @returns {string} The body block (no header, no trailing blank-line separator).
 */
function renderMarkdownBody(reasoningText) {
    return formatLinesAsBlockquote(reasoningText.split("\n"), {italicParagraphs: true}).join("\n")
}

/**
 * Truncate a multi-line text to at most `maxLines` lines, appending a plain
 * note indicating how many lines were dropped. Used by `renderReasoning` to
 * honour the user's `maxLines` config before delegating to the chosen renderer.
 *
 * IMPORTANT: this helper returns PLAIN TEXT (no blockquote prefix, no italic
 * asterisks). The renderer is responsible for applying the surrounding style to
 * the appended indicator line — this lets the indicator pick up the right
 * decoration depending on the active style (`markdown` → `> *…*`, `quote` →
 * `> …`, `compact` → counted as one more line in the badge, `details`/`strip`/
 * `raw` → emitted verbatim inside the body). Pre-formatting the indicator here
 * would cause double-wrapping because renderers treat every body line as
 * raw content and apply their own blockquote wrapping.
 *
 * If the input has fewer or equal lines than `maxLines`, it is returned
 * unchanged. `maxLines` that does not parse as a positive integer disables
 * truncation (defensive — callers should validate upstream, but this keeps
 * the helper safe to use on raw user input).
 *
 * @param {string} text - Raw reasoning text (may contain newlines).
 * @param {*} maxLines - Maximum number of lines to retain (positive integer).
 * @returns {string} The original text when under the limit, otherwise the
 *   first `maxLines` lines followed by a plain `... [+N lines of reasoning truncated]...` indicator line.
 */
export function truncateLines(text, maxLines) {
    if (!Number.isInteger(maxLines) || maxLines <= 0) {
        return text
    }
    const lines = text.split("\n")
    if (lines.length <= maxLines) {
        return text
    }
    const retained = lines.slice(0, maxLines).join("\n")
    const remaining = lines.length - maxLines
    return `${retained}\n... [+${remaining} lines of reasoning truncated]...`
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
 * Resolve a polymorphic second argument into a `{label, style, metadata, maxLines}`
 * options object. Accepts a string (treated as the label, style and
 * metadata default), an object with `{label, style, metadata, maxLines}`, or any
 * falsy value (defaults all of them). Invalid styles fall back to `"markdown"`.
 * `maxLines` only passes through when it is a positive integer — defensive against
 * user-input drift (`null`, `0`, negative, strings, NaN, floats all drop the field).
 *
 * @param {string|{label?: string, style?: string, metadata?: object, maxLines?: *}|undefined|null} optionsOrLabel
 * @returns {{label: string, style: string, metadata: object|undefined, maxLines: number|undefined}}
 */
function normalizeOptions(optionsOrLabel) {
    if (typeof optionsOrLabel === "string") {
        return {label: optionsOrLabel, style: "markdown", metadata: undefined, maxLines: undefined}
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
        const maxLines =
            typeof optionsOrLabel.maxLines === "number" &&
            Number.isInteger(optionsOrLabel.maxLines) &&
            optionsOrLabel.maxLines > 0
                ? optionsOrLabel.maxLines
                : undefined
        return {label, style, metadata, maxLines}
    }
    return {label: "Reasoning", style: "markdown", metadata: undefined, maxLines: undefined}
}

/**
 * Render reasoning text as a GFM blockquote (italic body + em-dash header).
 * Backward-compatible equivalent of the v0.2.0 `renderReasoning` body for
 * paragraph-only reasoning. Since v0.4.0 the body is produced by
 * `renderMarkdownBody`, which preserves code fences, indentation, and list
 * syntax. Paragraph lines still render as `> *${line.trim()}*`, byte-identical
 * to v0.2.0 and v0.3.0.
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
    const body = renderMarkdownBody(reasoningText)
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
 * Render reasoning text as a clean GFM blockquote — same shape as the
 * `markdown` style but WITHOUT italic asterisk wrapping on paragraph lines.
 * Code fences, indentation, and list syntax are preserved by the shared
 * `formatLinesAsBlockquote` state machine; only the paragraph branch is
 * changed (pass-through instead of italic).
 *
 * Intended for terminals that already render italic weakly (e.g. consoles
 * without ANSI italic) — the `quote` style keeps the blockquote-looking
 * separator while avoiding the asterisk soup that garbles on plain TUI.
 *
 * `metadata` is accepted for signature parity with the polymorphic dispatcher
 * but is intentionally ignored — the `quote` style does not surface a badge.
 *
 * @param {string} reasoningText - Raw reasoning text (may contain newlines).
 * @param {string|undefined} label - Header label; falls back to "Reasoning".
 * @param {object} [_metadata] - Ignored; present for dispatcher signature parity.
 * @returns {string} Blockquote block ending with `\n\n`.
 */
function renderQuote(reasoningText, label, _metadata) {
    const safeLabel = typeof label === "string" && label.length > 0 ? label : "Reasoning"
    const header = formatHeader(safeLabel)
    const body = formatLinesAsBlockquote(reasoningText.split("\n"), {italicParagraphs: false}).join(
        "\n"
    )
    return `${header}\n${body}\n\n`
}

/**
 * Render reasoning text as a compact summary badge: a single-line header that
 * records the total line count, followed by only the FIRST line of the body
 * wrapped in italics and a `*...*` indicator that more lines were elided.
 * Designed for long reasoning traces in small terminals — the user sees that
 * reasoning happened, how many lines it spanned, and a one-line preview.
 *
 * `metadata` is accepted for signature parity with the polymorphic dispatcher
 * but is intentionally ignored — the `compact` style does not surface duration
 * or token badges (its header already communicates "reasoning summary").
 *
 * @param {string} reasoningText - Raw reasoning text (may contain newlines).
 * @param {string|undefined} label - Header label; falls back to "Reasoning".
 * @param {object} [_metadata] - Ignored; present for dispatcher signature parity.
 * @returns {string} Compact summary block ending with `\n\n`.
 */
function renderCompact(reasoningText, label, _metadata) {
    const safeLabel = typeof label === "string" && label.length > 0 ? label : "Reasoning"
    const lines = reasoningText.split("\n")
    const lineCount = lines.length
    const header = `> ### ── ${safeLabel} (${lineCount} lines) ──`
    const firstLine = lines[0] !== undefined ? lines[0] : ""
    const preview = firstLine.trim().length > 0 ? firstLine.trim() : firstLine
    return `${header}\n> *${preview}*\n> *...*\n\n`
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
    raw: renderRaw,
    quote: renderQuote,
    compact: renderCompact
})

/**
 * Render a reasoning block using the requested style.
 *
 * Polymorphic second argument:
 * - `string`                                  → label only; style + metadata default (backward-compat).
 * - `{label, style, metadata, maxLines}`      → all knobs; invalid `style` silently falls back to `"markdown"`.
 *                                              `maxLines` is silently dropped if not a positive integer.
 * - `undefined | null`                        → defaults: label `"Reasoning"`, style `"markdown"`, no metadata, no truncation.
 *
 * The optional 3rd argument `metadata` is forwarded to the chosen renderer.
 * Only the `markdown` renderer currently surfaces it (header decoration); the
 * other styles ignore it but accept the parameter for dispatcher uniformity.
 *
 * When `optionsOrLabel.maxLines` is provided and the input has more lines,
 * `truncateLines` runs first so the truncation indicator is decorated by the
 * chosen style (it lands inside a code-fence-safe blockquote line).
 *
 * @param {string} reasoningText - Raw reasoning text (may contain newlines).
 * @param {string|{label?: string, style?: string, metadata?: object, maxLines?: number}|undefined|null} [optionsOrLabel]
 *   Either a label string (backward-compat) or an options object.
 * @param {{durationMs?: number, tokens?: number, budget?: number}} [metadata]
 *   Optional reasoning metadata forwarded to the renderer. When `optionsOrLabel`
 *   is an object, its `metadata` field takes precedence over this argument.
 * @returns {string} Rendered reasoning block; the trailing `\n\n` separator is preserved across all styles.
 */
export function renderReasoning(reasoningText, optionsOrLabel, metadata) {
    const {label, style, metadata: optionsMetadata, maxLines} = normalizeOptions(optionsOrLabel)
    const effectiveMetadata = optionsMetadata !== undefined ? optionsMetadata : metadata
    const truncated =
        maxLines !== undefined ? truncateLines(reasoningText, maxLines) : reasoningText
    const renderer = RENDER_STYLES[style] || renderMarkdownQuote
    return renderer(truncated, label, effectiveMetadata)
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
