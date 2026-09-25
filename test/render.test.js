import assert from "node:assert/strict"
import {test} from "node:test"
import {
    RENDER_STYLES,
    compose,
    formatDuration,
    formatHeader,
    formatTokens,
    renderReasoning,
    renderResponse
} from "../src/render.js"

const DIM = "\x1b[2m"
const RESET = "\x1b[0m"
const BOLD = "\x1b[1m"
const UNDERLINE = "\x1b[4m"

test("renderReasoning emits header with label and blockquote body", () => {
    const out = renderReasoning("hello world", "Reasoning")
    assert.ok(out.includes("> ### ── Reasoning ──"), "header has label")
    assert.match(out, /hello world/)
    assert.match(out, /> \*hello world\*/)
    assert.match(out, /\n\n$/, "ends with blank-line separator")
})

test("renderReasoning respects custom label", () => {
    const out = renderReasoning("x", "My Label")
    assert.match(out, /── My Label ──/)
})

test("renderResponse emits 2-space indented text, no header, no dim", () => {
    const out = renderResponse("the answer")
    assert.ok(!out.includes("──"), "no header")
    assert.ok(!out.includes(DIM), "no dim")
    assert.match(out, /^ {2}the answer/)
})

test("compose combines reasoning block and response block", () => {
    const detection = {reasoning: "thinking hard", source: "thinking", kind: "block"}
    const out = compose(detection, "final answer")
    assert.ok(out.includes("thinking hard"))
    assert.ok(out.includes("final answer"))
    assert.ok(out.indexOf("thinking hard") < out.indexOf("final answer"))
})

// ─── Phase 3: configurable render styles ────────────────────────────────────

test("renderReasoning: details style wraps reasoning in <details>/<summary>", () => {
    const out = renderReasoning("hello", {label: "Reasoning", style: "details"})
    assert.match(out, /^<details><summary>Reasoning<\/summary>/)
    assert.match(out, /hello/)
    assert.match(out, /<\/details>/)
    assert.match(out, /\n\n$/, "ends with blank-line separator")
})

test("renderReasoning: details style HTML-escapes label and body", () => {
    const out = renderReasoning('<script>alert("xss")</script>', {label: "<R>", style: "details"})
    assert.ok(!out.includes("<script>"), "raw <script> not present")
    assert.ok(!out.includes("<R>"), "raw <R> not present")
    assert.match(out, /&lt;script&gt;/)
    assert.match(out, /&lt;R&gt;/)
})

test("renderReasoning: strip style returns empty string", () => {
    const out = renderReasoning("this should be dropped", {label: "Reasoning", style: "strip"})
    assert.equal(out, "")
})

test("renderReasoning: raw style is a pass-through of the reasoning text", () => {
    const out = renderReasoning("the bare text", {label: "Reasoning", style: "raw"})
    assert.equal(out, "the bare text\n\n")
})

test("renderReasoning: polymorphic dispatcher accepts options object with style override", () => {
    const out = renderReasoning("hi", {label: "Custom", style: "details"})
    assert.match(out, /<summary>Custom<\/summary>/)
})

test("renderReasoning: invalid style silently falls back to markdown", () => {
    const out = renderReasoning("hello", {label: "L", style: "bogus"})
    assert.match(out, /> ### ── L ──/)
    assert.match(out, /> \*hello\*/)
})

test("renderReasoning: missing style in options falls back to markdown", () => {
    const out = renderReasoning("hello", {label: "L"})
    assert.match(out, /> ### ── L ──/)
})

test("renderReasoning: string label still dispatches to markdown (backward compat)", () => {
    const out = renderReasoning("hello", "TestLabel")
    assert.equal(
        out,
        "> ### ── TestLabel ──\n> *hello*\n\n",
        "string-label API must produce identical v0.2.0 output"
    )
})

test("renderReasoning: undefined second argument uses defaults", () => {
    const out = renderReasoning("hello")
    assert.match(out, /> ### ── Reasoning ──/)
    assert.match(out, /> \*hello\*/)
})

test("RENDER_STYLES map exposes all four styles", () => {
    assert.equal(typeof RENDER_STYLES.markdown, "function")
    assert.equal(typeof RENDER_STYLES.details, "function")
    assert.equal(typeof RENDER_STYLES.strip, "function")
    assert.equal(typeof RENDER_STYLES.raw, "function")
})

test("RENDER_STYLES map is frozen", () => {
    assert.ok(Object.isFrozen(RENDER_STYLES), "RENDER_STYLES must be frozen")
})

// ─── Phase 3 v3: header metadata badges (duration + tokens) ──────────────────

test("formatHeader: no metadata produces byte-identical v0.2.0 output", () => {
    assert.equal(formatHeader("Reasoning"), "> ### ── Reasoning ──")
})

test("formatHeader: empty metadata object produces byte-identical v0.2.0 output", () => {
    assert.equal(formatHeader("Reasoning", {}), "> ### ── Reasoning ──")
})

test("formatHeader: durationMs < 1000 renders as ms (no ~)", () => {
    assert.equal(formatHeader("Reasoning", {durationMs: 500}), "> ### ── Reasoning (500ms) ──")
})

test("formatHeader: durationMs 1000-59999 renders as ~Ns with one decimal", () => {
    assert.equal(formatHeader("Reasoning", {durationMs: 1200}), "> ### ── Reasoning (~1.2s) ──")
    assert.equal(formatHeader("Reasoning", {durationMs: 30500}), "> ### ── Reasoning (~30.5s) ──")
})

test("formatHeader: durationMs >= 60000 renders as ~Nm Ms", () => {
    assert.equal(formatHeader("Reasoning", {durationMs: 65000}), "> ### ── Reasoning (~1m 5s) ──")
    assert.equal(formatHeader("Reasoning", {durationMs: 150000}), "> ### ── Reasoning (~2m 30s) ──")
})

test("formatHeader: tokens renders with plural form", () => {
    assert.equal(formatHeader("Reasoning", {tokens: 450}), "> ### ── Reasoning (450 tokens) ──")
})

test("formatHeader: tokens=1 renders with singular form", () => {
    assert.equal(formatHeader("Reasoning", {tokens: 1}), "> ### ── Reasoning (1 token) ──")
})

test("formatHeader: durationMs + tokens joined by ', ' in fixed order", () => {
    assert.equal(
        formatHeader("Reasoning", {durationMs: 1200, tokens: 450}),
        "> ### ── Reasoning (~1.2s, 450 tokens) ──"
    )
})

test("formatHeader: tokens + durationMs reversed input still renders in duration-first order", () => {
    // Badge part order is fixed (duration, tokens), not insertion order.
    assert.equal(
        formatHeader("Reasoning", {tokens: 450, durationMs: 1200}),
        "> ### ── Reasoning (~1.2s, 450 tokens) ──"
    )
})

test("formatHeader: metadata.budget alone produces no badge (not surfaced)", () => {
    assert.equal(formatHeader("Reasoning", {budget: 4096}), "> ### ── Reasoning ──")
})

test("formatHeader: metadata with only negative / nullish durationMs renders no badge", () => {
    assert.equal(formatHeader("Reasoning", {durationMs: -1}), "> ### ── Reasoning ──")
    assert.equal(formatHeader("Reasoning", {durationMs: null}), "> ### ── Reasoning ──")
})

test("formatHeader: metadata with zero durationMs renders literal 0ms", () => {
    assert.equal(formatHeader("Reasoning", {durationMs: 0}), "> ### ── Reasoning (0ms) ──")
})

test("formatDuration: ms < 1000 returns literal ms (no ~ prefix)", () => {
    assert.equal(formatDuration(0), "0ms")
    assert.equal(formatDuration(500), "500ms")
    assert.equal(formatDuration(999), "999ms")
})

test("formatDuration: ms 1000-59999 returns ~Ns with one decimal", () => {
    assert.equal(formatDuration(1000), "~1.0s")
    assert.equal(formatDuration(1200), "~1.2s")
    assert.equal(formatDuration(30500), "~30.5s")
    assert.equal(formatDuration(59999), "~60.0s")
})

test("formatDuration: ms >= 60000 returns ~Nm Ms (floor-rounded)", () => {
    assert.equal(formatDuration(60000), "~1m 0s")
    assert.equal(formatDuration(65000), "~1m 5s")
    assert.equal(formatDuration(125000), "~2m 5s")
})

test("formatDuration: defensive — null / undefined / negative / NaN return empty", () => {
    assert.equal(formatDuration(null), "")
    assert.equal(formatDuration(undefined), "")
    assert.equal(formatDuration(-1), "")
    assert.equal(formatDuration(-1000), "")
    assert.equal(formatDuration(Number.NaN), "")
    assert.equal(formatDuration(Number.POSITIVE_INFINITY), "")
    assert.equal(formatDuration("1200"), "")
    assert.equal(formatDuration({}), "")
})

test("formatTokens: zero, plural", () => {
    assert.equal(formatTokens(0), "0 tokens")
})

test("formatTokens: one, singular", () => {
    assert.equal(formatTokens(1), "1 token")
})

test("formatTokens: many, plural", () => {
    assert.equal(formatTokens(450), "450 tokens")
    assert.equal(formatTokens(1000), "1000 tokens")
})

test("formatTokens: defensive — null / undefined / negative / NaN return empty", () => {
    assert.equal(formatTokens(null), "")
    assert.equal(formatTokens(undefined), "")
    assert.equal(formatTokens(-1), "")
    assert.equal(formatTokens(-100), "")
    assert.equal(formatTokens(Number.NaN), "")
    assert.equal(formatTokens(Number.POSITIVE_INFINITY), "")
    assert.equal(formatTokens("450"), "")
})

test("renderReasoning: metadata via options object renders header badge (markdown)", () => {
    const out = renderReasoning("hello", {
        label: "Thinking",
        style: "markdown",
        metadata: {durationMs: 1200}
    })
    assert.match(out, /^> ### ── Thinking \(~1\.2s\) ──/, "first line carries badge")
    assert.match(out, /> \*hello\*/)
})

test("renderReasoning: metadata via options object renders combined badge", () => {
    const out = renderReasoning("hello", {
        label: "Reasoning",
        style: "markdown",
        metadata: {durationMs: 1200, tokens: 450}
    })
    assert.match(out, /> ### ── Reasoning \(~1\.2s, 450 tokens\) ──/)
})

test("renderReasoning: string label API remains byte-identical to v0.2.0 (back-compat)", () => {
    const out = renderReasoning("hello", "Plain Label")
    assert.equal(
        out,
        "> ### ── Plain Label ──\n> *hello*\n\n",
        "string-label API without metadata must remain byte-identical to v0.2.0"
    )
})

test("renderReasoning: options object without metadata remains byte-identical to v0.2.0", () => {
    const out = renderReasoning("hello", {label: "L", style: "markdown"})
    assert.equal(
        out,
        "> ### ── L ──\n> *hello*\n\n",
        "options object without metadata must remain byte-identical to v0.2.0"
    )
})

test("renderReasoning: 3rd-arg metadata is forwarded to markdown renderer", () => {
    const out = renderReasoning("hello", "Reasoning", {tokens: 1})
    assert.match(out, /> ### ── Reasoning \(1 token\) ──/)
})

test("renderReasoning: options.metadata wins over 3rd-arg metadata", () => {
    const out = renderReasoning("hello", {label: "L", metadata: {tokens: 5}}, {tokens: 9999})
    assert.match(out, /> ### ── L \(5 tokens\) ──/, "options.metadata takes precedence")
    assert.ok(!out.includes("9999"), "stale 3rd-arg metadata must not leak")
})

test("renderReasoning: details style ignores metadata (no badge leak)", () => {
    const out = renderReasoning("hello", {
        label: "Reasoning",
        style: "details",
        metadata: {durationMs: 1200, tokens: 450}
    })
    assert.match(out, /^<details><summary>Reasoning<\/summary>/)
    assert.ok(!out.includes("(~1.2s"), "details style must not leak duration badge")
    assert.ok(!out.includes("tokens"), "details style must not leak tokens badge")
})

test("renderReasoning: strip style ignores metadata", () => {
    const out = renderReasoning("hello", {
        label: "Reasoning",
        style: "strip",
        metadata: {durationMs: 1200, tokens: 450}
    })
    assert.equal(out, "")
})

test("renderReasoning: raw style ignores metadata", () => {
    const out = renderReasoning("the bare text", {
        label: "Reasoning",
        style: "raw",
        metadata: {durationMs: 1200, tokens: 450}
    })
    assert.equal(out, "the bare text\n\n")
})

// ─── Phase 4 v4: code fence, indentation and list preservation ───────────────

test("renderReasoning preserves code fences without wrapping in asterisks", () => {
    const reasoning =
        "Let us write code:\n```python\ndef hello():\n    return 'world'\n```\nDone thinking."
    const rendered = renderReasoning(reasoning)
    assert.match(rendered, /> ```python/)
    // biome-ignore lint/complexity/noMultipleSpacesInRegularExpressionLiterals: 5-space indent is intentional and matches the v4 plan verbatim
    assert.match(rendered, />     return 'world'/)
    assert.match(rendered, /> ```/)
    assert.doesNotMatch(rendered, /> \*```python\*/)
})

test("renderReasoning preserves markdown lists inside reasoning", () => {
    const reasoning = "Steps:\n- Step 1\n- Step 2"
    const rendered = renderReasoning(reasoning)
    assert.match(rendered, /> - Step 1/)
    assert.match(rendered, /> - Step 2/)
})
