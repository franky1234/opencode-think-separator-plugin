import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {dirname, join} from "node:path"
import {test} from "node:test"
import {fileURLToPath} from "node:url"
import {
    REASONING_FIELDS,
    REASONING_TAG_NAMES,
    compileReasoningTagRegex,
    detectReasoning,
    extractReasoningFromText
} from "../src/detect-reasoning.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixture = (name) => JSON.parse(readFileSync(join(__dirname, "fixtures", name), "utf8"))

test("REASONING_FIELDS includes all 10 whitelisted field names", () => {
    for (const f of [
        "thinking",
        "reasoning",
        "reasoning_content",
        "reasoning_text",
        "redacted_thinking",
        "thoughts",
        "cot",
        "chain_of_thought",
        "internal_monologue",
        "reflection"
    ]) {
        assert.ok(REASONING_FIELDS.includes(f), `missing ${f}`)
    }
})

test("detectReasoning finds Anthropic thinking block in content[]", () => {
    const msg = fixture("anthropic-thinking.json")
    const r = detectReasoning(msg)
    assert.ok(r, "should detect")
    assert.equal(r.source, "thinking")
    assert.equal(r.kind, "block")
    assert.match(r.reasoning, /user wants X/)
})

test("detectReasoning finds OpenAI reasoning_content top-level field", () => {
    const msg = fixture("openai-reasoning.json")
    const r = detectReasoning(msg)
    assert.ok(r)
    assert.equal(r.source, "reasoning_content")
    assert.equal(r.kind, "field")
})

test("detectReasoning finds Google thoughts top-level field", () => {
    const msg = fixture("google-thoughts.json")
    const r = detectReasoning(msg)
    assert.ok(r)
    assert.equal(r.source, "thoughts")
    assert.equal(r.kind, "field")
})

test("detectReasoning finds MiniMax thinking block in content[]", () => {
    const msg = fixture("minimax-thinking.json")
    const r = detectReasoning(msg)
    assert.ok(r)
    assert.equal(r.source, "thinking")
    assert.equal(r.kind, "block")
})

test("detectReasoning returns null for control fixture (no reasoning)", () => {
    const msg = fixture("no-reasoning-control.json")
    assert.equal(detectReasoning(msg), null)
})

test("extractReasoningFromText handles standard <think>...</think> tags", () => {
    const text = "<think>Let me calculate 2+2.</think>\nThe answer is 4."
    const {reasoningTexts, cleanText} = extractReasoningFromText(text)
    assert.equal(reasoningTexts.length, 1)
    assert.equal(reasoningTexts[0], "Let me calculate 2+2.")
    assert.equal(cleanText, "The answer is 4.")
})

test("extractReasoningFromText handles multiple reasoning blocks", () => {
    const text = "<think>Step 1</think> intermediate <think>Step 2</think> final response"
    const {reasoningTexts, cleanText} = extractReasoningFromText(text)
    assert.equal(reasoningTexts.length, 2)
    assert.equal(reasoningTexts[0], "Step 1")
    assert.equal(reasoningTexts[1], "Step 2")
    assert.match(cleanText, /intermediate.*final response/)
})

test("extractReasoningFromText handles unclosed <think> tag gracefully", () => {
    const text = "<think>Reasoning interrupted due to length"
    const {reasoningTexts, cleanText} = extractReasoningFromText(text)
    assert.equal(reasoningTexts.length, 1)
    assert.equal(reasoningTexts[0], "Reasoning interrupted due to length")
    assert.equal(cleanText, "")
})

test("extractReasoningFromText handles various tag names (<thought>, <antThinking>, <reasoning>)", () => {
    const t1 = "<thought>Gemini style</thought>Answer 1"
    assert.equal(extractReasoningFromText(t1).reasoningTexts[0], "Gemini style")

    const t2 = "<antThinking>Claude prompt style</antThinking>Answer 2"
    assert.equal(extractReasoningFromText(t2).reasoningTexts[0], "Claude prompt style")

    const t3 = "<reasoning>Generic style</reasoning>Answer 3"
    assert.equal(extractReasoningFromText(t3).reasoningTexts[0], "Generic style")
})

test("detectReasoning detects XML tags inside string message.content", () => {
    const msg = {content: "<think>DeepSeek-R1 raw text</think>Here is the code."}
    const r = detectReasoning(msg)
    assert.ok(r)
    assert.equal(r.source, "tag")
    assert.equal(r.reasoning, "DeepSeek-R1 raw text")
})

// ──────────────────────────────────────────────────────────────────────────
// Component 2 (v3 upgrade): dynamic tag compilation + metadata extraction
// ──────────────────────────────────────────────────────────────────────────

test("internal_thought tag is detected by default (REASONING_TAG_NAMES expanded)", () => {
    const text = "<internal_thought>Hidden internal reasoning</internal_thought>Final answer."
    const {reasoningTexts, cleanText} = extractReasoningFromText(text)
    assert.equal(reasoningTexts.length, 1)
    assert.equal(reasoningTexts[0], "Hidden internal reasoning")
    assert.equal(cleanText, "Final answer.")
    assert.ok(
        REASONING_TAG_NAMES.includes("internal_thought"),
        "internal_thought must be in the default REASONING_TAG_NAMES whitelist"
    )
})

test("extractReasoningFromText(text, [custom_tag]) recognises custom tag but NOT think", () => {
    const text = "<custom_tag>Custom reasoning</custom_tag> after.<think>Built-in tag</think>"
    const {reasoningTexts, cleanText} = extractReasoningFromText(text, ["custom_tag"])
    assert.equal(
        reasoningTexts.length,
        1,
        "only the custom tag should match; built-ins are dropped"
    )
    assert.equal(reasoningTexts[0], "Custom reasoning")
    assert.match(cleanText, /after\./)
    assert.match(
        cleanText,
        /<think>Built-in tag<\/think>/,
        "unrecognized <think> should be left untouched"
    )
})

test("extractReasoningFromText(text, [think]) works with an explicit tags array (no behaviour change)", () => {
    const text = "<think>Still works explicitly</think>Final."
    const {reasoningTexts, cleanText} = extractReasoningFromText(text, ["think"])
    assert.equal(reasoningTexts.length, 1)
    assert.equal(reasoningTexts[0], "Still works explicitly")
    assert.equal(cleanText, "Final.")
})

test("extractReasoningFromText with empty/invalid tags array falls back to defaults", () => {
    const text = "<think>Built-in default</think> final."
    const fromEmpty = extractReasoningFromText(text, [])
    const fromStrings = extractReasoningFromText(text, ["", 42, null])
    const fromDefaults = extractReasoningFromText(text)
    assert.deepEqual(fromEmpty, fromDefaults, "[] should fall back to defaults")
    assert.deepEqual(
        fromStrings,
        fromDefaults,
        "all-non-string entries should fall back to defaults"
    )
})

test("compileReasoningTagRegex(REASONING_TAG_NAMES) returns the same regex set on repeated calls (cache hit)", () => {
    const first = compileReasoningTagRegex(REASONING_TAG_NAMES)
    const second = compileReasoningTagRegex(REASONING_TAG_NAMES)
    assert.ok(first && second, "should compile regex set")
    assert.strictEqual(
        first.CLOSED,
        second.CLOSED,
        "CLOSED regex should be reference-equal across calls (cache hit)"
    )
    assert.strictEqual(
        first.UNCLOSED,
        second.UNCLOSED,
        "UNCLOSED regex should be reference-equal across calls (cache hit)"
    )
    assert.strictEqual(
        first.ORPHAN,
        second.ORPHAN,
        "ORPHAN regex should be reference-equal across calls (cache hit)"
    )
})

test("compileReasoningTagRegex returns a fresh regex set when the input array differs", () => {
    const defaultRegexes = compileReasoningTagRegex(REASONING_TAG_NAMES)
    const customRegexes = compileReasoningTagRegex(["custom_tag"])
    assert.notStrictEqual(
        defaultRegexes.CLOSED,
        customRegexes.CLOSED,
        "different array references must produce distinct regex objects"
    )
    const text = "<custom_tag>Hello</custom_tag>"
    const m = customRegexes.CLOSED.exec(text)
    assert.ok(m, "custom regex should match a custom tag")
    assert.equal(m[1], "custom_tag")
})

test("detectReasoning extracts thinking_duration_ms as metadata.durationMs", () => {
    const msg = {reasoning: "Some reasoning.", thinking_duration_ms: 1200}
    const r = detectReasoning(msg)
    assert.ok(r)
    assert.equal(r.source, "reasoning")
    assert.equal(r.kind, "field")
    assert.ok(r.metadata, "metadata should be present when a duration is supplied")
    assert.equal(r.metadata.durationMs, 1200)
})

test("detectReasoning extracts thinking_budget and thinking_tokens together", () => {
    const msg = {reasoning: "Some reasoning.", thinking_budget: 4096, thinking_tokens: 250}
    const r = detectReasoning(msg)
    assert.ok(r)
    assert.ok(r.metadata)
    assert.equal(r.metadata.budget, 4096)
    assert.equal(r.metadata.tokens, 250)
    assert.equal(r.metadata.durationMs, undefined, "no duration supplied → field absent")
})

test("detectReasoning accepts 0 as a valid metadata value (model produced zero reasoning)", () => {
    const msg = {reasoning: "Some reasoning.", thinking_duration_ms: 0, thinking_tokens: 0}
    const r = detectReasoning(msg)
    assert.ok(r)
    assert.ok(r.metadata)
    assert.equal(r.metadata.durationMs, 0)
    assert.equal(r.metadata.tokens, 0)
})

test("detectReasoning excludes negative / non-number / non-finite metadata values", () => {
    const negative = detectReasoning({reasoning: "x", thinking_duration_ms: -5})
    assert.ok(negative)
    assert.equal(negative.metadata, undefined, "negative number must not appear in metadata")

    const stringified = detectReasoning({reasoning: "x", thinking_duration_ms: "1200"})
    assert.ok(stringified)
    assert.equal(stringified.metadata, undefined, "string values must not appear in metadata")

    const nan = detectReasoning({reasoning: "x", thinking_budget: Number.NaN})
    assert.ok(nan)
    assert.equal(nan.metadata, undefined, "NaN must not appear in metadata")

    const infinity = detectReasoning({reasoning: "x", thinking_tokens: Number.POSITIVE_INFINITY})
    assert.ok(infinity)
    assert.equal(infinity.metadata, undefined, "Infinity must not appear in metadata")
})

test("detectReasoning returns null → no metadata either", () => {
    const r = detectReasoning(null)
    assert.equal(r, null)
})

test("detectReasoning(text-tag) carries metadata from the same message", () => {
    const msg = {
        content: [{type: "text", text: "<think>Reasoning</think> Answer."}],
        thinking_duration_ms: 999
    }
    const r = detectReasoning(msg)
    assert.ok(r)
    assert.equal(r.kind, "text_tag")
    assert.ok(r.metadata)
    assert.equal(r.metadata.durationMs, 999)
})
