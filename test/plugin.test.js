import assert from "node:assert/strict"
import {test} from "node:test"
import {ThinkSeparator, transformMessage} from "../src/index.js"

const LABEL = "Reasoning"
const DIM = "\x1b[2m"
const RESET = "\x1b[0m"

test("transformMessage: rewrites single reasoning part into text with header", () => {
    const msg = {
        info: {role: "assistant"},
        parts: [
            {type: "reasoning", text: "thinking hard"},
            {type: "text", text: "final answer"}
        ]
    }
    transformMessage(msg, LABEL)
    assert.equal(msg.parts.length, 1)
    assert.equal(msg.parts[0].type, "text")
    assert.match(msg.parts[0].text, /── Reasoning ──/)
    assert.match(msg.parts[0].text, /thinking hard/)
    assert.match(msg.parts[0].text, /final answer/)
    assert.ok(
        msg.parts[0].text.indexOf("thinking hard") < msg.parts[0].text.indexOf("final answer")
    )
})

test("transformMessage: collects multiple reasoning parts", () => {
    const msg = {
        info: {role: "assistant"},
        parts: [
            {type: "reasoning", text: "first thought"},
            {type: "reasoning", text: "second thought"},
            {type: "text", text: "answer"}
        ]
    }
    transformMessage(msg, LABEL)
    assert.equal(msg.parts.length, 1)
    assert.match(msg.parts[0].text, /first thought/)
    assert.match(msg.parts[0].text, /second thought/)
    assert.match(msg.parts[0].text, /answer/)
})

test("transformMessage: leaves message alone if no reasoning parts", () => {
    const msg = {
        info: {role: "assistant"},
        parts: [{type: "text", text: "plain response"}]
    }
    const original = JSON.stringify(msg)
    transformMessage(msg, LABEL)
    assert.equal(JSON.stringify(msg), original)
})

test("transformMessage: detects provider-native thinking block via detectReasoning", () => {
    const msg = {
        info: {role: "assistant"},
        parts: [
            {type: "thinking", text: "native thinking"},
            {type: "text", text: "final"}
        ]
    }
    transformMessage(msg, LABEL)
    assert.equal(msg.parts[0].type, "text")
    assert.match(msg.parts[0].text, /── Reasoning ──/)
    assert.match(msg.parts[0].text, /native thinking/)
})

test("transformMessage: respects custom label", () => {
    const msg = {
        info: {role: "assistant"},
        parts: [
            {type: "reasoning", text: "x"},
            {type: "text", text: "y"}
        ]
    }
    transformMessage(msg, "Thinking")
    assert.match(msg.parts[0].text, /── Thinking ──/)
})

test("transformMessage: extracts <think>...</think> from plain text parts (MiniMax/DeepSeek case)", () => {
    const msg = {
        info: {role: "assistant"},
        parts: [
            {
                type: "text",
                text: '<think>The user said "hi". This is a greeting, not a task requiring skills.</think>\n\nHola. ¿En qué te ayudo?'
            }
        ]
    }
    transformMessage(msg, LABEL)
    assert.equal(msg.parts.length, 1)
    assert.equal(msg.parts[0].type, "text")
    assert.match(msg.parts[0].text, /── Reasoning ──/)
    assert.match(msg.parts[0].text, /The user said "hi"/)
    assert.match(msg.parts[0].text, /Hola. ¿En qué te ayudo\?/)
    assert.ok(!msg.parts[0].text.includes("<think>"))
    assert.ok(!msg.parts[0].text.includes("</think>"))
})

test("transformMessage: preserves tool calls and non-text parts unchanged", () => {
    const msg = {
        info: {role: "assistant"},
        parts: [
            {type: "reasoning", text: "analyzing tool needed"},
            {type: "text", text: "Let me run a command."},
            {type: "tool_use", id: "call_1", name: "run_command", input: {command: "ls"}}
        ]
    }
    transformMessage(msg, LABEL)
    assert.equal(msg.parts.length, 2)
    assert.equal(msg.parts[0].type, "text")
    assert.match(msg.parts[0].text, /── Reasoning ──/)
    assert.match(msg.parts[0].text, /analyzing tool needed/)
    assert.match(msg.parts[0].text, /Let me run a command\./)
    assert.equal(msg.parts[1].type, "tool_use")
    assert.equal(msg.parts[1].name, "run_command")
})

test("transformMessage: handles unclosed <think> tag at end of text", () => {
    const msg = {
        info: {role: "assistant"},
        parts: [
            {
                type: "text",
                text: '<think>The user just said "hi". Let me think about whether any skills apply here.\nNo skills needed.'
            }
        ]
    }
    transformMessage(msg, LABEL)
    assert.equal(msg.parts.length, 1)
    assert.equal(msg.parts[0].type, "text")
    assert.match(msg.parts[0].text, /── Reasoning ──/)
    assert.match(msg.parts[0].text, /The user just said "hi"/)
    assert.ok(!msg.parts[0].text.includes("<think>"))
})

// ──────────────────────────────────────────────────────────────────────────
// v5.1 Task 8: Robust edge-case coverage
//
// `ThinkSeparator` is the opencode v1 plugin factory — every opencode
// session calls it with the load input and the user's plugin config.
// Both arguments are explicitly typed as `undefined`-tolerant, but a
// defensive call (`ThinkSeparator(null, null)`) must still produce a
// working plugin object with the default hook implementation.
// ──────────────────────────────────────────────────────────────────────────

test("ThinkSeparator(null, null) returns a plugin with the chat-messages hook and no compaction hook", async () => {
    // Both arguments are null. mergeConfig handles null `options` via
    // `options || {}` (line 366). The returned plugin must expose the
    // chat-messages transform hook (the v0.x contract) and must NOT
    // register the compaction hook (no opt-in).
    const plugin = await ThinkSeparator(/** @type {*} */ (null), /** @type {*} */ (null))
    assert.ok(plugin)
    assert.strictEqual(
        typeof plugin["experimental.chat.messages.transform"],
        "function",
        "chat-messages hook must be registered"
    )
    assert.strictEqual(
        plugin["experimental.session.compacting"],
        undefined,
        "compaction hook must NOT be registered when config is null"
    )

    // Calling the hook with a degenerate output (no messages array) must
    // not throw — the hook's defensive guard (line 373) early-returns.
    await assert.doesNotReject(plugin["experimental.chat.messages.transform"]({}, undefined))
    await assert.doesNotReject(plugin["experimental.chat.messages.transform"]({}, {}))
    await assert.doesNotReject(
        plugin["experimental.chat.messages.transform"]({}, {messages: undefined})
    )
})
