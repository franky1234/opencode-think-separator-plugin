import assert from "node:assert/strict"
import {test} from "node:test"
import {defaultConfig, mergeConfig, resolveModelConfig} from "../src/config.js"

test("mergeConfig({models: {...}}) stores the models map for later resolution", () => {
    const out = mergeConfig({
        models: {"deepseek/v4-pro": {label: "Deep Think"}}
    })
    assert.equal(out.label, "Reasoning")
    assert.equal(out.style, "markdown")
    assert.ok(out.models)
    assert.deepEqual(out.models, {"deepseek/v4-pro": {label: "Deep Think"}})
})

test("resolveModelConfig applies exact-match override", () => {
    const base = mergeConfig({
        models: {"deepseek/v4-pro": {label: "Deep Think"}}
    })
    const resolved = resolveModelConfig("deepseek/v4-pro", base)
    assert.equal(resolved.label, "Deep Think")
    assert.equal(resolved.style, "markdown")
})

test("resolveModelConfig returns baseConfig unchanged when no override matches", () => {
    const base = mergeConfig({
        models: {"deepseek/v4-pro": {label: "Deep Think"}}
    })
    const resolved = resolveModelConfig("unknown-model", base)
    assert.equal(resolved, base)
})

test("wildcard prefix 'deepseek/*' matches deepseek/v4-pro and deepseek/v3 but not anthropic/claude", () => {
    const base = mergeConfig({
        models: {"deepseek/*": {style: "details"}}
    })
    const a = resolveModelConfig("deepseek/v4-pro", base)
    const b = resolveModelConfig("deepseek/v3", base)
    const c = resolveModelConfig("anthropic/claude", base)
    assert.equal(a.style, "details")
    assert.equal(b.style, "details")
    assert.equal(c.style, "markdown")
    assert.equal(c.label, "Reasoning")
})

test("resolveModelConfig falls back to baseConfig when no override for anthropic/claude", () => {
    const base = mergeConfig({label: "Reasoning", style: "markdown"})
    const resolved = resolveModelConfig("anthropic/claude", base)
    assert.equal(resolved.label, "Reasoning")
    assert.equal(resolved.style, "markdown")
})

test("first-match-wins: earlier pattern in the map wins over later wildcard for same id", () => {
    const base = mergeConfig({
        models: {
            "deepseek/*": {label: "A"},
            "deepseek/v4-pro": {label: "B"}
        }
    })
    const resolved = resolveModelConfig("deepseek/v4-pro", base)
    assert.equal(resolved.label, "A")
})

test("mergeConfig({customTags: [...]}) stores the customTags array", () => {
    const out = mergeConfig({
        customTags: ["reflection", "thought_process"]
    })
    assert.deepEqual(out.customTags, ["reflection", "thought_process"])
})

test("mergeConfig({customTags: 'not-an-array'}) silently drops invalid customTags", () => {
    const out = mergeConfig({customTags: "not-an-array"})
    assert.equal(out.customTags, undefined)
})

test("mergeConfig({models: 'not-an-object'}) silently drops invalid models", () => {
    const out = mergeConfig({models: "not-an-object"})
    assert.equal(out.models, undefined)
})

test("frozen defaultConfig is not mutated by mergeConfig calls that include models/customTags", () => {
    const before = JSON.stringify(defaultConfig)
    mergeConfig({
        models: {"deepseek/v4-pro": {label: "X"}},
        customTags: ["reflection"]
    })
    mergeConfig({label: "Y"})
    const after = JSON.stringify(defaultConfig)
    assert.equal(before, after)
    assert.equal(Object.prototype.hasOwnProperty.call(defaultConfig, "models"), false)
    assert.equal(Object.prototype.hasOwnProperty.call(defaultConfig, "customTags"), false)
})
