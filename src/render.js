/**
 * Markdown-only formatter for reasoning + response blocks.
 *
 * Header: `###` heading wrapped in a blockquote with em-dash separators.
 * Reasoning body: blockquoted italic lines (visually demoted vs response).
 * Response body: pass-through indented with two leading spaces (matches reasoning indent).
 *
 * Output is pure GitHub-Flavored Markdown — renders correctly in any TUI/theme
 * that supports GFM, with no terminal-specific escape sequences.
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
 * Compose the full reasoning block: header + quoted body + trailing blank-line separator.
 * @param {string} reasoningText - Raw reasoning text (may contain newlines).
 * @param {string|undefined} label - Optional label; falls back to "Reasoning".
 * @returns {string} Markdown block ending with `\n\n`.
 */
export function renderReasoning(reasoningText, label) {
    const safeLabel = typeof label === "string" && label.length > 0 ? label : "Reasoning"
    const header = formatHeader(safeLabel)
    const body = reasoningText.split("\n").map(formatReasoningLine).join("\n")
    return `${header}\n${body}\n\n`
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
 * @param {{reasoning: string}} detection - Detection result (only `reasoning` is read).
 * @param {string} responseText - Raw response text.
 * @param {string|undefined} label - Optional label forwarded to `renderReasoning`.
 * @returns {string} Reasoning block immediately followed by indented response block.
 */
export function compose(detection, responseText, label) {
    return renderReasoning(detection.reasoning, label) + renderResponse(responseText)
}
