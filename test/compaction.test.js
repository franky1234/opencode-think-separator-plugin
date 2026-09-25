/**
 * Task 5 (v4): Context Optimization & Session Compaction Hook.
 *
 * Verifies two behaviours added to the `ThinkSeparator` factory:
 *
 * 1. The plugin object exposes `experimental.session.compacting` as a function
 *    that, when `config.compaction.stripReasoning === true`, pushes a
 *    directive into `output.context` instructing OpenCode's compactor to drop
 *    reasoning blocks from the compacted summary.
 *
 * 2. The pre-existing `experimental.chat.messages.transform` hook, when
 *    `config.stripHistory === true`, removes the already-rendered reasoning
 *    block from HISTORICAL assistant messages (the most recent assistant
 *    message is preserved). The reasoning-removal works on the rendered
 *    blockquote form (`> ### ── <label> ──` + `> *body*` lines + blank-line
 *    separator) so only the final response text remains.
 *
 * Both tests import the public `ThinkSeparator` factory from src/index.js —
 * no private helpers are exercised directly, matching the v0.3.0 back-compat
 * contract that downstream consumers only ever touch the factory.
 */

import assert from "node:assert/strict"
import test from "node:test"
import {ThinkSeparator, stripReasoningBlock} from "../src/index.js"

test("ThinkSeparator registers experimental.session.compacting hook", async () => {
    const plugin = await ThinkSeparator(undefined, {
        compaction: {stripReasoning: true}
    })
    assert.strictEqual(typeof plugin["experimental.session.compacting"], "function")
    const output = {context: []}
    await plugin["experimental.session.compacting"]({sessionID: "ses-123"}, output)
    assert.strictEqual(output.context.length, 1)
    assert.match(output.context[0], /Discard all reasoning blocks/i)
})

test("ThinkSeparator strips historical reasoning when stripHistory is enabled", async () => {
    const plugin = await ThinkSeparator(undefined, {
        stripHistory: true,
        maxHistoryReasoningTurns: 1
    })
    const output = {
        messages: [
            {
                info: {role: "assistant"},
                parts: [
                    {type: "text", text: "> ### ── Reasoning ──\n> *Old thought*\n\nOld response"}
                ]
            },
            {
                info: {role: "assistant"},
                parts: [{type: "text", text: "<think>Current thought</think>Current response"}]
            }
        ]
    }
    await plugin["experimental.chat.messages.transform"]({}, output)
    assert.doesNotMatch(output.messages[0].parts[0].text, /Reasoning/)
    assert.strictEqual(output.messages[0].parts[0].text, "Old response")
    assert.match(output.messages[1].parts[0].text, /Reasoning/)
})

test("compaction hook is NOT registered when stripReasoning is false", async () => {
    const plugin = await ThinkSeparator(undefined, {compaction: {stripReasoning: false}})
    assert.strictEqual(typeof plugin["experimental.session.compacting"], "undefined")
})

test("compaction hook is NOT registered when compaction is omitted entirely", async () => {
    const plugin = await ThinkSeparator(undefined, {})
    assert.strictEqual(typeof plugin["experimental.session.compacting"], "undefined")
})

test("compaction hook does not throw when output.context is missing or undefined", async () => {
    const plugin = await ThinkSeparator(undefined, {compaction: {stripReasoning: true}})
    const hook = plugin["experimental.session.compacting"]
    // No output at all
    await assert.doesNotReject(hook({}, undefined))
    // Empty output object
    await assert.doesNotReject(hook({}, {}))
    // Output without context
    await assert.doesNotReject(hook({}, {context: undefined}))
})

test("stripHistory is label-agnostic (works with custom labels)", async () => {
    const plugin = await ThinkSeparator(undefined, {stripHistory: true})
    const output = {
        messages: [
            {
                info: {role: "assistant"},
                parts: [
                    {type: "text", text: "> ### ── Thinking ──\n> *Old thought*\n\nOld response"}
                ]
            },
            {
                info: {role: "assistant"},
                parts: [{type: "text", text: "<think>Current</think>Current response"}]
            }
        ]
    }
    await plugin["experimental.chat.messages.transform"]({}, output)
    assert.doesNotMatch(output.messages[0].parts[0].text, /Thinking/)
    assert.strictEqual(output.messages[0].parts[0].text, "Old response")
})

test("stripHistory with maxHistoryReasoningTurns: 2 keeps the most recent historical message", async () => {
    const plugin = await ThinkSeparator(undefined, {
        stripHistory: true,
        maxHistoryReasoningTurns: 2
    })
    const output = {
        messages: [
            // Oldest: stripped
            {
                info: {role: "assistant"},
                parts: [
                    {type: "text", text: "> ### ── Reasoning ──\n> *Ancient*\n\nAncient response"}
                ]
            },
            // Middle: KEPT (within maxHistoryReasoningTurns - 1 = 1 historical)
            {
                info: {role: "assistant"},
                parts: [
                    {
                        type: "text",
                        text: "> ### ── Reasoning ──\n> *Recent historical*\n\nRecent response"
                    }
                ]
            },
            // Newest: NEVER stripped
            {
                info: {role: "assistant"},
                parts: [{type: "text", text: "<think>Current</think>Current response"}]
            }
        ]
    }
    await plugin["experimental.chat.messages.transform"]({}, output)
    assert.strictEqual(output.messages[0].parts[0].text, "Ancient response")
    assert.match(output.messages[1].parts[0].text, /Recent historical/)
    assert.match(output.messages[2].parts[0].text, /Reasoning/)
})

test("stripHistory skips non-assistant messages (tool, user, system)", async () => {
    const plugin = await ThinkSeparator(undefined, {stripHistory: true})
    const output = {
        messages: [
            // User message — should be untouched even if it contains a blockquote (it won't, but verify no crash)
            {info: {role: "user"}, parts: [{type: "text", text: "hello there"}]},
            // Assistant with reasoning
            {
                info: {role: "assistant"},
                parts: [{type: "text", text: "> ### ── Reasoning ──\n> *thought*\n\nresponse"}]
            }
        ]
    }
    await plugin["experimental.chat.messages.transform"]({}, output)
    // User message untouched
    assert.strictEqual(output.messages[0].parts[0].text, "hello there")
    // Assistant (most recent) NOT stripped
    assert.match(output.messages[1].parts[0].text, /Reasoning/)
})

// ---------------------------------------------------------------------------
// Direct tests for the exported `stripReasoningBlock` helper.
// ---------------------------------------------------------------------------

test("stripReasoningBlock is no-op for text without reasoning header", () => {
    assert.strictEqual(stripReasoningBlock("just plain text"), "just plain text")
})

test("stripReasoningBlock handles empty string", () => {
    assert.strictEqual(stripReasoningBlock(""), "")
})

test("stripReasoningBlock handles non-string input", () => {
    assert.strictEqual(stripReasoningBlock(null), null)
    assert.strictEqual(stripReasoningBlock(undefined), undefined)
})

test("stripReasoningBlock preserves code fences inside reasoning body", () => {
    const input =
        "> ### ── Reasoning ──\n> ```python\n> def f():\n>     return 1\n> ```\n\nFinal answer."
    const expected = "Final answer."
    assert.strictEqual(stripReasoningBlock(input), expected)
})

test("stripReasoningBlock keeps line if blank-line terminator is missing (defensive)", () => {
    const input = "> ### ── Reasoning ──\n> *thought*\nno blank line before this"
    const result = stripReasoningBlock(input)
    // The header + body are stripped; "no blank line before this" is preserved
    assert.doesNotMatch(result, /Reasoning/)
    assert.doesNotMatch(result, /thought/)
    assert.match(result, /no blank line before this/)
})
