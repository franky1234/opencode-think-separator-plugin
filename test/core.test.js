import assert from "node:assert/strict"
import {test} from "node:test"
import * as core from "../src/core.js"
import {
    createReasoningStreamParser,
    defaultConfig,
    detectReasoning,
    extractReasoningFromText,
    mergeConfig,
    renderReasoning
} from "../src/core.js"

test("core re-exports extractReasoningFromText and processes XML tags correctly", () => {
    assert.strictEqual(typeof extractReasoningFromText, "function")
    const {reasoningTexts, cleanText} = extractReasoningFromText(
        "<think>calculating</think>Result is 42"
    )
    assert.deepStrictEqual(reasoningTexts, ["calculating"])
    assert.strictEqual(cleanText, "Result is 42")
})

test("core re-exports detectReasoning and finds reasoning structures correctly", () => {
    assert.strictEqual(typeof detectReasoning, "function")
    const message = {
        content: [
            {type: "thinking", thinking: "internal process"},
            {type: "text", text: "visible output"}
        ]
    }
    const detected = detectReasoning(message)
    assert.ok(detected !== null)
    assert.strictEqual(detected?.reasoning, "internal process")
})

test("core re-exports renderReasoning and supports both styles and backward-compatible labels", () => {
    assert.strictEqual(typeof renderReasoning, "function")
    // Markdown default style with label
    const md = renderReasoning("my thoughts", "Analysis")
    assert.ok(md.includes("> ### ── Analysis ──"))
    assert.ok(md.includes("> *my thoughts*"))

    // Details style with options object
    const html = renderReasoning("hidden logic", {label: "Deep Dive", style: "details"})
    assert.ok(html.includes("<details><summary>Deep Dive</summary>"))
    assert.ok(html.includes("hidden logic"))
})

test("core re-exports defaultConfig and mergeConfig preserving immutability", () => {
    assert.strictEqual(typeof mergeConfig, "function")
    assert.strictEqual(defaultConfig.label, "Reasoning")
    assert.strictEqual(defaultConfig.style, "markdown")
    assert.ok(Object.isFrozen(defaultConfig))

    const custom = mergeConfig({label: "Custom", style: "details"})
    assert.strictEqual(custom.label, "Custom")
    assert.strictEqual(custom.style, "details")
})

test("core re-exports createReasoningStreamParser returning a functional parser instance", async () => {
    assert.strictEqual(typeof createReasoningStreamParser, "function")
    const parser = await createReasoningStreamParser()
    assert.ok(parser !== null)
    assert.strictEqual(typeof parser.feed, "function")
    assert.strictEqual(typeof parser.flush, "function")
    assert.strictEqual(typeof parser.getState, "function")

    // Feed a split chunk to verify full functionality through core
    const ev1 = parser.feed("Start <th")
    assert.deepStrictEqual(ev1, [])

    const ev2 = parser.feed("ink>thinking</think> End")
    assert.deepStrictEqual(ev2, [
        {type: "content", text: "Start "},
        {type: "reasoning", text: "thinking"},
        {type: "content", text: " End"}
    ])
})

test("core surface isolation: does not export OpenCode-specific hooks or plugin metadata", () => {
    assert.strictEqual(typeof core.ThinkSeparator, "undefined")
    assert.strictEqual(typeof core.transformMessage, "undefined")
    assert.strictEqual(typeof core.default, "undefined")
})
