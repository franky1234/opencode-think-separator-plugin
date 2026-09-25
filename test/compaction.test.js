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
import {ThinkSeparator} from "../src/index.js"

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
