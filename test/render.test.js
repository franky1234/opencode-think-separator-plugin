import assert from "node:assert/strict"
import {test} from "node:test"
import {RENDER_STYLES, compose, renderReasoning, renderResponse} from "../src/render.js"

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
