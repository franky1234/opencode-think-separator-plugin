import assert from "node:assert/strict"
import {test} from "node:test"
import {compose, renderReasoning, renderResponse} from "../src/render.js"

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
