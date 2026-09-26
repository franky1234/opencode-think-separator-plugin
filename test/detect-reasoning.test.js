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

test("extractReasoningFromText ignores <think> tags inside fenced code blocks", () => {
    const text =
        "Here is how to use it:\n```xml\n<think>do not extract this</think>\n```\n<think>real reasoning</think>\nFinal answer."
    const result = extractReasoningFromText(text)
    assert.deepStrictEqual(result.reasoningTexts, ["real reasoning"])
    assert.match(result.cleanText, /```xml\n<think>do not extract this<\/think>\n```/)
    assert.match(result.cleanText, /Final answer\./)
})

test("extractReasoningFromText ignores <think> tags inside inline code spans", () => {
    const text = "Mentioning `<think>test</think>` in text. <think>actual thought</think> Result."
    const result = extractReasoningFromText(text)
    assert.deepStrictEqual(result.reasoningTexts, ["actual thought"])
    assert.match(result.cleanText, /Mentioning `<think>test<\/think>` in text\./)
})

test("extractReasoningFromText does not treat mid-sentence <think> as an unclosed reasoning block", () => {
    const text = "Note: <think> tags are used for reasoning. The answer is 42."
    const result = extractReasoningFromText(text)
    assert.deepStrictEqual(result.reasoningTexts, [])
    assert.strictEqual(
        result.cleanText,
        "Note: <think> tags are used for reasoning. The answer is 42."
    )
})

// ──────────────────────────────────────────────────────────────────────────
// v4 Task 6: emerging model tags (Claude 3.7 redacted_thinking, Grok thought)
// ──────────────────────────────────────────────────────────────────────────

test("detectReasoning detects Claude 3.7 redacted_thinking and thinking signatures", () => {
    const msg = {
        content: [
            {type: "redacted_thinking", data: "encrypted_signature_data"},
            {type: "thinking", thinking: "Claude 3.7 thinking process"}
        ]
    }
    const result = detectReasoning(msg)
    assert.ok(result)
    assert.strictEqual(result.reasoning, "Claude 3.7 thinking process")
})

test("detectReasoning detects Grok <thought> tags", () => {
    const msg = {content: "<thought>Grok reasoning</thought>Hello"}
    const result = detectReasoning(msg)
    assert.ok(result)
    assert.strictEqual(result.reasoning, "Grok reasoning")
})

// ──────────────────────────────────────────────────────────────────────────
// v4 Task 6: real-shape fixture regression tests
// ──────────────────────────────────────────────────────────────────────────

test("detectReasoning loads Anthropic Claude 3.7 fixture (redacted_thinking + thinking blocks)", () => {
    const msg = fixture("anthropic-claude-3-7.json")
    const r = detectReasoning(msg)
    assert.ok(r, "should detect reasoning from Claude 3.7 fixture")
    assert.equal(r.kind, "block")
    assert.equal(r.source, "thinking", "first reasoning block wins over the redacted follow-up")
    assert.match(r.reasoning, /fault-tolerant retry strategy/)
})

test("detectReasoning loads DeepSeek R1 fixture (<think>...</think> inline)", () => {
    const msg = fixture("deepseek-r1-real.json")
    const r = detectReasoning(msg)
    assert.ok(r, "should detect reasoning from DeepSeek R1 fixture")
    assert.equal(r.kind, "text_tag")
    assert.equal(r.source, "tag")
    assert.match(r.reasoning, /sum of the first n odd numbers/)
    assert.match(r.reasoning, /gnomon/)
})

test("detectReasoning loads OpenAI o3 fixture (top-level reasoning_content)", () => {
    const msg = fixture("openai-o3-real.json")
    const r = detectReasoning(msg)
    assert.ok(r, "should detect reasoning from OpenAI o3 fixture")
    assert.equal(r.kind, "field")
    assert.equal(r.source, "reasoning_content")
    assert.match(r.reasoning, /Let me trace the plan/)
    assert.match(r.reasoning, /BRIN index/)
})

test("detectReasoning loads Google Gemini 2.5 fixture (top-level thoughts)", () => {
    const msg = fixture("google-gemini-2-5-real.json")
    const r = detectReasoning(msg)
    assert.ok(r, "should detect reasoning from Gemini 2.5 fixture")
    assert.equal(r.kind, "field")
    assert.equal(r.source, "thoughts")
    assert.match(r.reasoning, /includeThoughts/)
})

// ──────────────────────────────────────────────────────────────────────────
// v5.1 Task 6: ReDoS stress tests
//
// Adversarial inputs are designed to expose backtracking / catastrophic
// polynomial blow-up in any of the 5 user-facing regexes:
//
//   - CLOSED, UNCLOSED, ORPHAN  (compileReasoningTagRegex)
//   - FENCED_CODE_REGEX, INLINE_CODE_REGEX  (maskCodeSpans)
//
// The detector must complete each scenario in under 500ms on a developer
// laptop. Inputs that exceed that threshold signal a real ReDoS exposure
// that must be hardened before tagging v0.5.0.
// ──────────────────────────────────────────────────────────────────────────

/** ReDoS budget (milliseconds). Exceeding it fails the test and triggers hardening. */
const REDOS_BUDGET_MS = 500

test("[ReDoS] 10,000 unclosed <think> tags complete within 500ms", () => {
    // 10k repetitions of an opening tag with no matching closer. The engine
    // must NOT search for the missing closer on every candidate position
    // (would be O(n²) or worse on a naive pattern).
    const text = "<think>".repeat(10000)
    const start = performance.now()
    const {reasoningTexts, cleanText} = extractReasoningFromText(text)
    const elapsed = performance.now() - start
    assert.ok(
        elapsed < REDOS_BUDGET_MS,
        `extractReasoningFromText on 10k unclosed <think> tags took ${elapsed.toFixed(2)}ms (budget ${REDOS_BUDGET_MS}ms)`
    )
    // Behavioural sanity: exactly one unclosed block is captured (UNCLOSED
    // regex is anchored to start-of-string / after newline, so the first hit
    // swallows the rest), reasoning text is the trailing empty body.
    assert.ok(reasoningTexts.length >= 1, "should detect at least one unclosed block")
    assert.equal(typeof cleanText, "string", "cleanText must remain a string")
})

test("[ReDoS] 10,000 chars of unclosed code fence delimiters complete within 500ms", () => {
    // `"\`\`\`".repeat(3000)` = 9000 chars of fence-openers with no closing
    // fence. FENCED_CODE_REGEX has a backreference (`\2`) to the fence
    // delimiter — without proper anchors a naive pattern would attempt
    // every possible split of the backreference, turning a missing close
    // into catastrophic backtracking.
    const text = "```".repeat(3000)
    const start = performance.now()
    const {cleanText} = extractReasoningFromText(text)
    const elapsed = performance.now() - start
    assert.ok(
        elapsed < REDOS_BUDGET_MS,
        `extractReasoningFromText on 10k chars of unclosed fences took ${elapsed.toFixed(2)}ms (budget ${REDOS_BUDGET_MS}ms)`
    )
    assert.equal(typeof cleanText, "string", "cleanText must remain a string")
})

test("[ReDoS] 200KB text with pathological '<' characters complete within 500ms", () => {
    // ~200KB of interleaved `<<<tag>>>` fragments where consecutive openers
    // (`<<<`) are immediately closed by `>>>` before the next fragment opens
    // a new tag. No reasoning tag is ever fully opened, so every regex must
    // backtrack only linearly (not O(n²) or exponential) to confirm no
    // reasoning is present. The repeating pattern also creates many
    // candidate positions for the `[^>]*` and `\b` sub-patterns to chew on.
    const chunk = "<<<tag>>><<<tag>>><<<tag>>><<<tag>>>"
    const text = chunk.repeat(Math.ceil(200_000 / chunk.length))
    assert.ok(text.length >= 200_000, `input should be at least 200KB (got ${text.length})`)
    const start = performance.now()
    const {reasoningTexts, cleanText} = extractReasoningFromText(text)
    const elapsed = performance.now() - start
    assert.ok(
        elapsed < REDOS_BUDGET_MS,
        `extractReasoningFromText on 200KB of pathological '<' took ${elapsed.toFixed(2)}ms (budget ${REDOS_BUDGET_MS}ms)`
    )
    assert.deepEqual(reasoningTexts, [], "no reasoning should be detected")
    assert.equal(typeof cleanText, "string", "cleanText must remain a string")
})

// ──────────────────────────────────────────────────────────────────────────
// v5.1 Task 8: Robust edge-case coverage
//
// These tests guard against null / undefined / malformed inputs that crash
// or produce undefined behavior in defensive branches. The tests are
// contract tests — every assertion mirrors the documented "safe default"
// behavior in the JSDoc.
// ──────────────────────────────────────────────────────────────────────────

test('extractReasoningFromText("") returns an empty result for the empty-string edge case', () => {
    // Empty string: no `<`, so the function must early-return before any
    // regex compilation. cleanText must be the empty string (not `null`,
    // not `undefined` — callers use `cleanText.trim().length`).
    const result = extractReasoningFromText("")
    assert.deepEqual(result, {reasoningTexts: [], cleanText: ""})
    assert.equal(result.reasoningTexts.length, 0)
    assert.equal(result.cleanText, "")
})

test("extractReasoningFromText(null) does not throw and returns a safe default", () => {
    // Null input: the function must NOT throw. Defensive branch returns
    // `{reasoningTexts: [], cleanText: ""}` so callers can treat the result
    // uniformly regardless of input shape.
    const result = extractReasoningFromText(/** @type {*} */ (null))
    assert.deepEqual(result, {reasoningTexts: [], cleanText: ""})
})

test('extractReasoningFromText("text", null) ignores null tags and uses defaults', () => {
    // Null tags config: `resolveTags(null)` must fall back to the default
    // REASONING_TAG_NAMES whitelist. Text without `<` short-circuits
    // before any regex runs.
    const result = extractReasoningFromText("text", /** @type {*} */ (null))
    assert.deepEqual(result, {reasoningTexts: [], cleanText: "text"})
})

test("compileReasoningTagRegex filters non-string elements defensively", () => {
    // A mis-shaped customTags entry (number, null, object) MUST NOT produce
    // a regex that matches its non-string representation. Only the valid
    // string element should appear in the compiled pattern.
    const regexes = compileReasoningTagRegex(/** @type {*} */ ([123, null, "think"]))
    // Match a valid tag — should succeed
    const validMatch = regexes.CLOSED.exec("<think>reasoning</think>")
    assert.ok(validMatch, "valid string element must still match")
    assert.equal(validMatch[1], "think")
    // The numeric `123` must NOT appear as a tag name in any match
    assert.ok(
        !regexes.CLOSED.source.includes("123|"),
        "numeric element must be filtered out of the compiled pattern"
    )
    assert.ok(
        !regexes.CLOSED.source.includes("|123"),
        "numeric element must not leak into the alternation"
    )
})

// ──────────────────────────────────────────────────────────────────────────
// v5.1 Task 9: Performance boundary at scale (1MB payload)
//
// The detector must complete a realistic 1MB input (interleaved code fences,
// prose, and <think> reasoning) within the 500ms budget. The input is built
// programmatically (loop + concat) so the test source stays small while
// still stress-testing every code path: code-span masking, closed-tag
// extraction, unclosed-tag fallback, and orphan-tag sanitisation.
// ──────────────────────────────────────────────────────────────────────────

/** Performance budget (milliseconds). Exceeding it fails the test. */
const PERF_BUDGET_MS = 500

test("[perf] extractReasoningFromText completes in <500ms on a 1MB realistic payload", () => {
    // Realistic 1MB payload modelling typical model output: plain prose
    // introducing the answer, fenced code-block examples shown as part of
    // the response, and <think>...</think> reasoning blocks (with inline
    // backtick code mentions inside them — the realistic case for a model
    // that discusses code while reasoning). Repeating the chunk
    // programmatically builds ~1MB without inlining the literal text in
    // the source file.
    //
    // Chunk structure (realistic):
    //   - prose intro
    //   - one fenced code block outside any think (final-answer example)
    //   - first think block with extended reasoning + inline code mentions
    //   - second think block with extended reasoning + inline code mentions
    //   - one fenced code block outside any think (another example)
    //   - prose outro
    const reasoning1 =
        "Let me think about the algorithmic complexity of the proposed solution. " +
        "The built-in sort is O(n log n) for most practical inputs. " +
        "For 10^5 elements, this runs in a few milliseconds. " +
        "Memory usage is O(n) due to in-place modification. " +
        "Modern JavaScript engines use stable sorts (TimSort in V8). " +
        "For typed arrays, sort is even faster due to contiguous memory. " +
        "OK let me move on. " +
        "I think the built-in sort is sufficient for this problem. " +
        "No need to reinvent the wheel. " +
        "OK time to wrap up the reasoning."
    const reasoning2 =
        "Here's a Python equivalent for comparison. " +
        "Python's sort uses TimSort as well, with O(n log n) worst case. " +
        "OK moving on. " +
        "Let me also think about edge cases. " +
        "Already-sorted input still takes O(n log n). " +
        "Reverse-sorted input takes O(n log n). " +
        "Arrays with many duplicates take O(n log n). " +
        "So the worst case is always O(n log n). " +
        "OK moving on for real this time. " +
        "Time to wrap up this reasoning block. " +
        "I think I have a good understanding now. " +
        "Let me write the response now. " +
        "One more consideration: the choice between in-place and out-of-place sort. " +
        "In-place is faster but uses less memory. " +
        "Out-of-place is slower but uses more memory. " +
        "For most use cases, in-place is preferred. " +
        "OK that's enough for this reasoning block."
    const chunk = `Let me begin the analysis. The user wants an efficient solution. I'll walk through the considerations step by step. First, let's understand the requirements. The user is asking about algorithmic complexity and best practices for sorting.
\`\`\`js
function sort(arr) { return arr.sort() }
\`\`\`
JS above shows the basic pattern. Modern engines use TimSort.
<think>${reasoning1}</think>
After first think, moving on.
<think>${reasoning2}</think>
OK done with second think block.
\`\`\`cpp
std::sort(v.begin(), v.end())
\`\`\`
C++ uses std::sort for the same purpose.
The recommended approach is to use the built-in sort. It's well-tested and optimal for most use cases. No need to reinvent the wheel unless you have specific requirements. Choose the language that best fits your needs. JavaScript, Python, C++, Go, Rust all have excellent built-in sorts. Use whichever language your project requires.
`
    const target = 1_000_000
    const repetitions = Math.ceil(target / chunk.length)
    const payload = chunk.repeat(repetitions)
    assert.ok(
        payload.length >= 1_000_000,
        `payload should reach ~1MB (got ${payload.length} bytes, target ${target})`
    )

    const start = performance.now()
    const {reasoningTexts, cleanText} = extractReasoningFromText(payload)
    const elapsed = performance.now() - start

    assert.ok(
        elapsed < PERF_BUDGET_MS,
        `extractReasoningFromText on 1MB realistic payload took ${elapsed.toFixed(2)}ms (budget ${PERF_BUDGET_MS}ms)`
    )
    // Behavioural sanity: reasoning blocks were extracted and cleanText preserved
    assert.ok(
        reasoningTexts.length > 0,
        "should extract at least one reasoning block from the interleaved payload"
    )
    assert.equal(typeof cleanText, "string", "cleanText must remain a string")
    // Sanity on the lower bound: most of the 1MB payload is prose +
    // code-block lines that survive cleanup, so cleanText should remain
    // large. A collapse to <100KB would signal a runaway strip / regex bug
    // (each ~2KB chunk contributes ~700 bytes of cleanText, so ~500
    // repetitions yield ~350KB of cleaned prose + code lines).
    assert.ok(
        cleanText.length >= 100_000,
        `cleanText suspiciously small (${cleanText.length} bytes) — possible regression`
    )
})
