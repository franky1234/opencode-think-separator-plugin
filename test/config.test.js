import assert from "node:assert/strict"
import {test} from "node:test"
import {defaultConfig, mergeConfig} from "../src/config.js"

test('defaultConfig.label is "Reasoning"', () => {
    assert.equal(defaultConfig.label, "Reasoning")
})

test("mergeConfig returns defaults when given empty input", () => {
    assert.deepEqual(mergeConfig({}), defaultConfig)
})

test("mergeConfig overrides label when provided", () => {
    const out = mergeConfig({label: "Thinking"})
    assert.equal(out.label, "Thinking")
})

test("mergeConfig ignores unknown keys (forward-compat)", () => {
    const out = mergeConfig({label: "X", futureOption: 42})
    assert.equal(out.label, "X")
    assert.equal(Object.prototype.hasOwnProperty.call(out, "futureOption"), false)
})

test("mergeConfig accepts 'markdown-rendered' as a valid style (v0.5.0)", () => {
    const out = mergeConfig({style: "markdown-rendered"})
    assert.equal(out.style, "markdown-rendered")
})
