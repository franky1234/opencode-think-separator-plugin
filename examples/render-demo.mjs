/**
 * Render-demo.mjs — Reproducible demo of every render style in
 * `src/render.js#RENDER_STYLES` against the same realistic reasoning input.
 *
 * Usage:
 *     node examples/render-demo.mjs          # from repo root
 *     node ./examples/render-demo.mjs        # same
 *
 * What it prints:
 *     For each of the 7 supported styles (markdown, details, strip, raw, quote,
 *     compact, markdown-rendered), the demo prints the same reasoning input
 *     rendered with that style, prefixed by a clearly labeled header and
 *     surrounded by `═` separators. A final section demonstrates the
 *     `maxLines: 3` truncation knob applied to the `markdown` style.
 *
 * The reasoning input is declared as a top-level constant (`REASONING_INPUT`)
 * so you can swap it for your own content and re-run the script to compare
 * styles against your data.
 *
 * Pure ESM, zero runtime dependencies. Imports directly from the repo's
 * `src/render.js` via relative path so it always reflects the current source.
 */

import {renderReasoning} from "../src/render.js"

const REASONING_INPUT = [
    "First, I need to **understand** the request carefully.",
    "",
    "The user is asking about the `think` block format that several providers",
    "expose. Here is what I know:",
    "",
    "1. Anthropic emits a top-level `thinking` field on assistant messages.",
    "2. OpenAI uses `<reasoning>` tags inside content strings.",
    "3. Google Gemini nests `thoughts` inside `parts`.",
    "",
    "An example code snippet that demonstrates the parsing logic:",
    "",
    "```js",
    "const out = detectReasoning(message, customTags)",
    "if (out) console.log(out.reasoning)",
    "```",
    "",
    "_End of reasoning — proceeding to the final answer._"
].join("\n")

const LABEL = "Reasoning"
const META = {durationMs: 1234, tokens: 57}

const STYLES = [
    {key: "markdown", blurb: "Default blockquote, italic body, code fences preserved"},
    {key: "details", blurb: "Collapsible <details><summary> HTML block"},
    {key: "strip", blurb: "Bare label only — body removed"},
    {key: "raw", blurb: "Raw text wrapped in a labeled fence"},
    {key: "quote", blurb: "Plain blockquote, no italics or header"},
    {key: "compact", blurb: "Header on first line, body blockquoted underneath"},
    {key: "markdown-rendered", blurb: "Full markdown preservation (opt-in, no italics)"}
]

const RULE = "═".repeat(72)
const SUB = "─".repeat(72)

function show(key, blurb) {
    const header = `${SUB}\n${key.toUpperCase()}  ·  ${blurb}\n${SUB}`
    const out = renderReasoning(REASONING_INPUT, {label: LABEL, style: key, metadata: META})
    console.log(header)
    console.log(out)
}

console.log(`${RULE}\nOPENCODE THINK-SEPARATOR-PLUGIN — render demo\n${RULE}\n`)
console.log(`Same reasoning input rendered with each of the 7 supported styles.\n`)
console.log(
    `Input length: ${REASONING_INPUT.length} chars, ${REASONING_INPUT.split("\n").length} lines.\n`
)

for (const {key, blurb} of STYLES) {
    show(key, blurb)
}

console.log(`${RULE}\nMAXLINES DEMO  ·  markdown style truncated to 3 lines\n${RULE}`)
const truncated = renderReasoning(REASONING_INPUT, {
    label: LABEL,
    style: "markdown",
    metadata: META,
    maxLines: 3
})
console.log(truncated)
