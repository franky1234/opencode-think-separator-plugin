import assert from "node:assert/strict"
import {test} from "node:test"
import {STATE_CONTENT, STATE_REASONING, createReasoningStreamParser} from "../src/stream.js"

/**
 * Tests for the streaming reasoning parser FSM.
 *
 * Each test exercises one chunk-boundary scenario. The factory returns a
 * fresh instance per call, so test isolation is built-in.
 */

test("scenario 1: reasoning tag fully inside one chunk", () => {
    const p = createReasoningStreamParser()
    const events = p.feed("<think>hello</think>")
    // The reasoning block ends in the same chunk; trailing text would land in a second feed
    assert.deepEqual(events, [{type: "reasoning", text: "hello"}])
    assert.equal(p.getState(), STATE_CONTENT)
})

test("scenario 2: opening tag split across chunks (`<th` + `ink>...`)", () => {
    const p = createReasoningStreamParser()
    const first = p.feed("<th")
    // Partial opening tag must be buffered, no events yet
    assert.deepEqual(first, [])
    assert.equal(p.getState(), STATE_CONTENT)

    const second = p.feed("ink>hello</think>")
    assert.deepEqual(second, [{type: "reasoning", text: "hello"}])
    assert.equal(p.getState(), STATE_CONTENT)
})

test("scenario 3: closing tag split across chunks (`...</think` + `>`)", () => {
    const p = createReasoningStreamParser()
    const first = p.feed("<think>hello</think")
    // Partial closing tag must be buffered, no events yet
    assert.deepEqual(first, [])
    assert.equal(p.getState(), STATE_REASONING)

    const second = p.feed(">")
    assert.deepEqual(second, [{type: "reasoning", text: "hello"}])
    assert.equal(p.getState(), STATE_CONTENT)
})

test("scenario 4: both tags split across multiple chunks", () => {
    const p = createReasoningStreamParser()
    // First chunk only contains the partial opening tag
    assert.deepEqual(p.feed("<thi"), [])
    assert.equal(p.getState(), STATE_CONTENT)

    // Second chunk completes the opening tag and starts the reasoning body
    const events = p.feed("nk>partial reasoning")
    assert.deepEqual(events, [{type: "reasoning", text: "partial reasoning"}])
    assert.equal(p.getState(), STATE_REASONING)

    // Third chunk only contains the partial closing tag
    assert.deepEqual(p.feed("</th"), [])
    assert.equal(p.getState(), STATE_REASONING)

    // Fourth chunk completes the closing tag
    const tail = p.feed("ink>")
    assert.deepEqual(tail, [])
    assert.equal(p.getState(), STATE_CONTENT)
})

test("scenario 5: multiple reasoning blocks in a single feed call", () => {
    const p = createReasoningStreamParser()
    const events = p.feed("<think>first</think>between<think>second</think>")
    assert.deepEqual(events, [
        {type: "reasoning", text: "first"},
        {type: "content", text: "between"},
        {type: "reasoning", text: "second"}
    ])
    assert.equal(p.getState(), STATE_CONTENT)
})

test("scenario 6: reasoning block at the start of the stream (no leading content)", () => {
    const p = createReasoningStreamParser()
    const events = p.feed("<think>at start</think>rest")
    assert.deepEqual(events, [
        {type: "reasoning", text: "at start"},
        {type: "content", text: "rest"}
    ])
    assert.equal(p.getState(), STATE_CONTENT)
})

test("scenario 7: reasoning block at the end (no trailing content), flushed explicitly", () => {
    const p = createReasoningStreamParser()
    // First chunk: content before the open tag, then the open tag itself.
    // The reasoning body has no `<` inside it, so the FSM emits it
    // eagerly in the same feed call once it knows the buffer cannot
    // become a closing tag.
    const first = p.feed("before<think>reasoning body")
    assert.deepEqual(first, [
        {type: "content", text: "before"},
        {type: "reasoning", text: "reasoning body"}
    ])
    assert.equal(p.getState(), STATE_REASONING)

    // Second chunk closes the reasoning block; with nothing after, the
    // close tag transitions us back to CONTENT and nothing else is emitted.
    const tail = p.feed("</think>")
    assert.deepEqual(tail, [])
    assert.equal(p.getState(), STATE_CONTENT)

    // Nothing left to flush
    assert.deepEqual(p.flush(), [])
})

test("scenario 8: unclosed reasoning tag emits the buffered reasoning via feed()", () => {
    // Documented behaviour: the FSM eagerly emits reasoning text once it
    // is sure the buffer cannot become a closing tag (no `<` present).
    // For a stream that simply never closes its reasoning block, this
    // means the body lands in the final `feed()` call rather than in
    // `flush()`. `flush()` is a no-op once the buffer is empty.
    const p = createReasoningStreamParser()
    const events = p.feed("<think>orphan reasoning")
    assert.deepEqual(events, [{type: "reasoning", text: "orphan reasoning"}])
    assert.equal(p.getState(), STATE_REASONING)

    // Flush after an end-of-stream with no closing tag — nothing buffered.
    assert.deepEqual(p.flush(), [])
})

test("scenario 9: no reasoning tag → plain content passthrough", () => {
    const p = createReasoningStreamParser()
    const events = p.feed("just plain text, nothing to see here")
    assert.deepEqual(events, [{type: "content", text: "just plain text, nothing to see here"}])
    assert.equal(p.getState(), STATE_CONTENT)

    // Flush is a no-op when the buffer is empty
    assert.deepEqual(p.flush(), [])
})

test("scenario 10: mixed content → reasoning → content", () => {
    const p = createReasoningStreamParser()
    const events = p.feed("hello<think>plan</think>world")
    assert.deepEqual(events, [
        {type: "content", text: "hello"},
        {type: "reasoning", text: "plan"},
        {type: "content", text: "world"}
    ])
    assert.equal(p.getState(), STATE_CONTENT)
})

test("scenario 11 (bonus): unicode inside reasoning block", () => {
    const p = createReasoningStreamParser()
    const events = p.feed("<think>π≈3.14 — línea en español 🧠 — emoji ✓</think>done")
    assert.deepEqual(events, [
        {type: "reasoning", text: "π≈3.14 — línea en español 🧠 — emoji ✓"},
        {type: "content", text: "done"}
    ])
})

test("scenario 12 (bonus): custom tagNames option", () => {
    const p = createReasoningStreamParser({tagNames: ["custom"]})
    // The custom tag is recognised
    const events = p.feed("<custom>thought</custom>after")
    assert.deepEqual(events, [
        {type: "reasoning", text: "thought"},
        {type: "content", text: "after"}
    ])

    // Default tag names are NOT recognised when overridden
    const p2 = createReasoningStreamParser({tagNames: ["custom"]})
    const plain = p2.feed("<think>not reasoning</think>")
    assert.deepEqual(plain, [{type: "content", text: "<think>not reasoning</think>"}])
})

test("non-string and empty chunks are ignored", () => {
    const p = createReasoningStreamParser()
    // Each call must be a no-op
    assert.deepEqual(p.feed(""), [])
    assert.deepEqual(p.feed(undefined), [])
    assert.deepEqual(p.feed(null), [])
    assert.deepEqual(p.feed(42), [])
    assert.deepEqual(p.feed({}), [])
    assert.equal(p.getState(), STATE_CONTENT)
    assert.deepEqual(p.flush(), [])
})

test("factory returns independent instances (no shared state)", () => {
    const a = createReasoningStreamParser()
    const b = createReasoningStreamParser()
    a.feed("<think>alpha")
    // Parser `a` is mid-reasoning; parser `b` must remain untouched
    assert.equal(a.getState(), STATE_REASONING)
    assert.equal(b.getState(), STATE_CONTENT)

    const eventsB = b.feed("only content")
    assert.deepEqual(eventsB, [{type: "content", text: "only content"}])
    assert.equal(b.getState(), STATE_CONTENT)
})

test("whitespace and case-insensitive tags are recognised", () => {
    const p = createReasoningStreamParser()
    // Leading whitespace inside the tag, uppercase tag name, trailing whitespace before `>`
    const events = p.feed("<  THINK  >body</think>more")
    assert.deepEqual(events, [
        {type: "reasoning", text: "body"},
        {type: "content", text: "more"}
    ])
})
