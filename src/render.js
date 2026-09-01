/**
 * ANSI-aware render of reasoning + response blocks.
 *
 * Header: bold + underline (high contrast against body).
 * Reasoning body: dim (visually demoted vs response).
 * Response body: pass-through with 2-space indent (matches reasoning indent).
 *
 * Uses standard ANSI escapes — works on any modern terminal, theme-agnostic.
 */

const DIM = "\x1b[2m"
const RESET = "\x1b[0m"
const BOLD = "\x1b[1m"
const UNDERLINE = "\x1b[4m"

export function renderReasoning(reasoningText, label) {
    const safeLabel = typeof label === "string" && label.length > 0 ? label : "Reasoning"
    const header = `> ### ── ${safeLabel} ──`
    const body = reasoningText
        .split("\n")
        .map((line) => (line.trim().length > 0 ? `> *${line}*` : ">"))
        .join("\n")
    return `${header}\n${body}\n\n`
}

export function renderResponse(responseText) {
    return responseText
        .split("\n")
        .map((line) => `  ${line}`)
        .join("\n")
}

export function compose(detection, responseText, label) {
    return renderReasoning(detection.reasoning, label) + renderResponse(responseText)
}
