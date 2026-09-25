/**
 * Pipeline-integration tests — Component 4 of v0.3.0 upgrade.
 *
 * Wires Tasks 1-3 together via `transformMessage`:
 * - per-message config (resolveModelConfig)
 * - custom XML reasoning tag whitelist (customTags)
 * - header metadata badge (durationMs / tokens)
 *
 * Back-compat contract from `test/plugin.test.js` is preserved by the
 * `transformMessage` string-label path.
 */

import assert from "node:assert/strict"
import {test} from "node:test"
import {ThinkSeparator, transformMessage} from "../src/index.js"

test("pipeline: transformMessage with string label produces identical output to v0.2.0 (back-compat)", () => {
    const msg = {
        info: {role: "assistant"},
        parts: [
            {type: "reasoning", text: "thinking"},
            {type: "text", text: "answer"}
        ]
    }
    transformMessage(msg, "Reasoning")
    assert.equal(msg.parts.length, 1)
    assert.equal(msg.parts[0].type, "text")
    // Back-compat: byte-identical to v0.2.0 header (no badge) + body + separator.
    assert.match(msg.parts[0].text, /^> ### ── Reasoning ──\n> \*thinking\*\n\nanswer$/)
})

test("pipeline: transformMessage with options {label, style, customTags} extracts custom XML tag", () => {
    const msg = {
        info: {role: "assistant"},
        parts: [
            {
                type: "text",
                text: "<custom_reasoning>deep thought</custom_reasoning>\nthe response"
            }
        ]
    }
    transformMessage(msg, {
        label: "Reasoning",
        style: "markdown",
        customTags: ["custom_reasoning"]
    })
    assert.equal(msg.parts.length, 1)
    assert.equal(msg.parts[0].type, "text")
    assert.match(msg.parts[0].text, /── Reasoning ──/)
    assert.match(msg.parts[0].text, /deep thought/)
    assert.match(msg.parts[0].text, /the response/)
    assert.ok(!msg.parts[0].text.includes("<custom_reasoning>"))
})

test("pipeline: transformMessage with fallback-detected reasoning attaches metadata badge (duration)", () => {
    // The reasoning field is NOT a `type: "reasoning"` part — it's a
    // top-level field, so partitionMessageParts yields nothing and the
    // fallback detector (detectReasoning) runs. That detector also runs
    // extractMetadata on the same message and attaches the badge.
    const msg = {
        info: {role: "assistant"},
        parts: [{type: "text", text: "final"}],
        reasoning: "thought",
        thinking_duration_ms: 1200
    }
    transformMessage(msg, {label: "Reasoning", style: "markdown"})
    assert.equal(msg.parts[0].type, "text")
    assert.match(msg.parts[0].text, /> ### ── Reasoning \(~1\.2s\) ──/)
    assert.match(msg.parts[0].text, /thought/)
})

test("pipeline: transformMessage with style:'details' renders <details> block", () => {
    const msg = {
        info: {role: "assistant"},
        parts: [
            {type: "reasoning", text: "deep logic"},
            {type: "text", text: "surface answer"}
        ]
    }
    transformMessage(msg, {label: "X", style: "details"})
    assert.equal(msg.parts[0].type, "text")
    assert.match(msg.parts[0].text, /^<details><summary>X<\/summary>/)
    assert.match(msg.parts[0].text, /deep logic/)
    assert.match(msg.parts[0].text, /surface answer/)
})

test("pipeline: transformMessage with {label, style: 'markdown'} and metadata renders badge", () => {
    const msg = {
        info: {role: "assistant"},
        parts: [{type: "text", text: "final"}],
        reasoning: "thoughts",
        thinking_duration_ms: 1200,
        thinking_tokens: 450
    }
    transformMessage(msg, {label: "Reasoning", style: "markdown"})
    assert.equal(msg.parts[0].type, "text")
    assert.match(msg.parts[0].text, /> ### ── Reasoning \(~1\.2s, 450 tokens\) ──/)
})

test("pipeline: ThinkSeparator factory + models override routes per-model label", async () => {
    const factory = await ThinkSeparator(undefined, {
        models: {
            "anthropic/claude": {label: "Claude"}
        }
    })
    assert.ok(factory)
    assert.ok(typeof factory["experimental.chat.messages.transform"] === "function")

    const msg = {
        info: {role: "assistant", model: "anthropic/claude"},
        parts: [
            {type: "reasoning", text: "let me think"},
            {type: "text", text: "ok"}
        ]
    }
    await factory["experimental.chat.messages.transform"](undefined, {messages: [msg]})

    assert.equal(msg.parts.length, 1)
    assert.equal(msg.parts[0].type, "text")
    assert.match(msg.parts[0].text, /── Claude ──/)
    assert.match(msg.parts[0].text, /let me think/)
    assert.match(msg.parts[0].text, /ok/)
})

test("pipeline: ThinkSeparator factory leaves non-assistant messages untouched", async () => {
    const factory = await ThinkSeparator(undefined, {
        models: {"anthropic/claude": {label: "Claude"}}
    })
    const userMsg = {
        info: {role: "user"},
        parts: [{type: "text", text: "hello"}]
    }
    const assistantMsg = {
        info: {role: "assistant", model: "anthropic/claude"},
        parts: [
            {type: "reasoning", text: "r"},
            {type: "text", text: "a"}
        ]
    }
    await factory["experimental.chat.messages.transform"](undefined, {
        messages: [userMsg, assistantMsg]
    })
    // User message must remain untouched (no header injected).
    assert.equal(userMsg.parts.length, 1)
    assert.equal(userMsg.parts[0].text, "hello")
    // Assistant message must have been transformed.
    assert.equal(assistantMsg.parts.length, 1)
    assert.match(assistantMsg.parts[0].text, /── Claude ──/)
})

test("pipeline: ThinkSeparator factory falls back to base config when model has no override", async () => {
    const factory = await ThinkSeparator(undefined, {
        label: "Thinking",
        models: {"anthropic/claude": {label: "Claude"}}
    })
    const msg = {
        info: {role: "assistant", model: "openai/gpt-4"},
        parts: [
            {type: "reasoning", text: "r"},
            {type: "text", text: "a"}
        ]
    }
    await factory["experimental.chat.messages.transform"](undefined, {messages: [msg]})
    assert.equal(msg.parts[0].type, "text")
    assert.match(msg.parts[0].text, /── Thinking ──/)
})

test("pipeline: ThinkSeparator factory tolerates missing msg.info.model (defensive)", async () => {
    const factory = await ThinkSeparator(undefined, {
        label: "Thinking",
        models: {"anthropic/claude": {label: "Claude"}}
    })
    const msg = {
        info: {role: "assistant"},
        parts: [
            {type: "reasoning", text: "r"},
            {type: "text", text: "a"}
        ]
    }
    await factory["experimental.chat.messages.transform"](undefined, {messages: [msg]})
    assert.equal(msg.parts[0].type, "text")
    // No override matches → base label "Thinking" is used.
    assert.match(msg.parts[0].text, /── Thinking ──/)
})

test("pipeline: ThinkSeparator factory tolerates completely missing msg.info", async () => {
    const factory = await ThinkSeparator(undefined, {
        label: "Thinking",
        models: {"anthropic/claude": {label: "Claude"}}
    })
    const msg = {
        parts: [
            {type: "reasoning", text: "r"},
            {type: "text", text: "a"}
        ]
    }
    await factory["experimental.chat.messages.transform"](undefined, {messages: [msg]})
    assert.equal(msg.parts[0].type, "text")
    assert.match(msg.parts[0].text, /── Thinking ──/)
})

test("pipeline: transformMessage unifies multiple reasoning blocks under a single header", () => {
    const msg = {
        parts: [
            {
                type: "text",
                text: "<think>part one</think> Middle text. <think>part two</think> End."
            }
        ]
    }
    transformMessage(msg)
    const textPart = msg.parts[0].text
    const headerMatches = textPart.match(/> ### ── Reasoning ──/g)
    assert.strictEqual(headerMatches?.length, 1, "Should only have one reasoning header")
    assert.match(textPart, /part one/)
    assert.match(textPart, /part two/)
    assert.match(textPart, /Middle text\. {1,2}End\./)
})

test("pipeline: ThinkSeparator factory propagates customTags to the detector", async () => {
    const factory = await ThinkSeparator(undefined, {
        customTags: ["custom_reasoning"]
    })
    const msg = {
        info: {role: "assistant"},
        parts: [
            {
                type: "text",
                text: "<custom_reasoning>deep thought</custom_reasoning>\nfinal"
            }
        ]
    }
    await factory["experimental.chat.messages.transform"](undefined, {messages: [msg]})
    assert.equal(msg.parts[0].type, "text")
    assert.match(msg.parts[0].text, /── Reasoning ──/)
    assert.match(msg.parts[0].text, /deep thought/)
    assert.match(msg.parts[0].text, /final/)
    assert.ok(!msg.parts[0].text.includes("<custom_reasoning>"))
})
