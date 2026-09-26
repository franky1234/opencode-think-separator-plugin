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

// ──────────────────────────────────────────────────────────────────────────
// v5.1 Task 8: Robust edge-case coverage
//
// These tests guard the defensive branches in mergeConfig — null/invalid
// inputs MUST silently fall back to defaults (forward-compat) without
// throwing. Prototype pollution MUST be impossible regardless of how the
// user-supplied config is shaped (JSON.parse exposes __proto__ as an
// own property; literal-object syntax does not, so the JSON.parse path
// is the realistic attack surface).
// ──────────────────────────────────────────────────────────────────────────

test("mergeConfig({compaction: null}) silently drops null compaction", () => {
    // `sanitizeCompaction(null)` must return undefined → compaction is
    // omitted from the merged config (back-compat: mergeConfig({compaction:null})
    // deep-equals defaultConfig).
    const out = mergeConfig({compaction: null})
    assert.equal(Object.prototype.hasOwnProperty.call(out, "compaction"), false)
    assert.deepEqual(out, defaultConfig)
})

test('mergeConfig({compaction: "invalid"}) silently drops wrong-type compaction', () => {
    // Strings are not plain objects → sanitizeCompaction must drop them.
    // The merged config must NOT carry a `compaction` field.
    const out = mergeConfig({compaction: "invalid"})
    assert.equal(Object.prototype.hasOwnProperty.call(out, "compaction"), false)
})

test("mergeConfig({models: []}) silently drops an empty-arrays models map", () => {
    // Array is rejected by sanitizeModels (line 193: `Array.isArray([])` is
    // true → return undefined). Back-compat: empty-arrays models maps have
    // no effect on the resolved config.
    const out = mergeConfig({models: []})
    assert.equal(Object.prototype.hasOwnProperty.call(out, "models"), false)
    assert.deepEqual(out, defaultConfig)
})

test("mergeConfig strips __proto__ / constructor / prototype keys (prototype-pollution defence)", () => {
    // The JSON.parse path exposes `__proto__` as an own enumerable property
    // (unlike the literal-object syntax, which routes it through the
    // prototype setter). A defensive mergeConfig MUST NOT let those keys
    // propagate to the returned config — otherwise a malicious or malformed
    // opencode.json could pollute Object.prototype globally.
    const payload = JSON.parse(
        '{"__proto__": {"polluted": "yes"}, "constructor": {"polluted": "yes"}, "prototype": {"polluted": "yes"}, "label": "Safe Label"}'
    )
    // Sanity-check the payload actually carries the dangerous keys
    assert.ok(
        Object.prototype.hasOwnProperty.call(payload, "__proto__"),
        "test fixture must expose __proto__ as an own property"
    )
    const out = mergeConfig(payload)
    // The dangerous keys must NOT appear in the returned config
    assert.equal(
        Object.prototype.hasOwnProperty.call(out, "__proto__"),
        false,
        "__proto__ must be stripped"
    )
    assert.equal(
        Object.prototype.hasOwnProperty.call(out, "constructor"),
        false,
        "constructor must be stripped"
    )
    assert.equal(
        Object.prototype.hasOwnProperty.call(out, "prototype"),
        false,
        "prototype must be stripped"
    )
    // The legitimate label must still come through
    assert.equal(out.label, "Safe Label")
    // Global Object.prototype must not have been mutated
    assert.equal({}.polluted, undefined, "global Object.prototype must not be polluted")
})
