import {test} from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {join, dirname} from "node:path"
import {fileURLToPath} from "node:url"
import {
    detectReasoning,
    extractReasoningFromText,
    REASONING_FIELDS
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
