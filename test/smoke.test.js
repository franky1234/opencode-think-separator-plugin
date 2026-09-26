/**
 * Standalone plugin smoke test — Task 13 of v5.1.
 *
 * Purpose: exercise the plugin's public entry-point contract end-to-end
 * without a live TUI. This is the automated cross-version guarantee that
 * `docs/COMPATIBILITY.md` (## Automated CI matrix) describes: the hook
 * contract (`experimental.chat.messages.transform`) must keep accepting
 * the same message shape across the Node 18/20/22 × opencode ≥ 1.15
 * matrix, and the renderer must keep emitting the canonical
 * `── Reasoning ──` header.
 *
 * Why a separate file (not just more cases in `plugin.test.js`):
 * - The hook consumer in `plugin.test.js` is the lower-level
 *   `transformMessage` helper. This file exercises the full
 *   `default` export — the surface opencode itself loads — so a regression
 *   that breaks the v1 `{id, server}` contract fails here, not in the
 *   unit-level tests.
 * - It loads `test/fixtures/smoke-message.json` from disk so the fixture
 *   is reviewable independently of the test code and can be expanded by
 *   future contributors (per `test/fixtures/README.md`).
 *
 * No live TUI is required: the test imports `src/index.js` directly via
 * `node:vm`-free ESM, so it runs inside the same `node --test` invocation
 * that exercises the rest of the suite. CI runs this on every Node
 * matrix cell.
 */

import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {dirname, resolve} from "node:path"
import {test} from "node:test"
import {fileURLToPath} from "node:url"
import pluginDefault, {ThinkSeparator} from "../src/index.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const SMOKE_FIXTURE_PATH = resolve(__dirname, "fixtures/smoke-message.json")

/**
 * Read the synthetic smoke fixture from disk and return a deep copy so
 * each test can mutate its own instance without aliasing other tests.
 * Loading from disk (vs. inlining the JSON) is deliberate — it matches
 * how every other provider fixture in `test/fixtures/` is consumed and
 * lets future contributors add new shapes without touching this file.
 *
 * @returns {Record<string, unknown>}
 */
function loadSmokeFixture() {
    const raw = readFileSync(SMOKE_FIXTURE_PATH, "utf8")
    return JSON.parse(raw)
}

test("smoke: default export has the opencode v1 contract shape {id, server}", () => {
    assert.ok(pluginDefault, "default export must be defined")
    assert.equal(typeof pluginDefault, "object")
    assert.equal(typeof pluginDefault.id, "string")
    assert.ok(pluginDefault.id.length > 0, "plugin id must be non-empty")
    assert.equal(
        typeof pluginDefault.server,
        "function",
        "plugin.server must be the ThinkSeparator factory"
    )
})

test("smoke: ThinkSeparator() returns a plugin object with experimental.chat.messages.transform", async () => {
    // Pass `undefined` for both args to mirror the opencode v1 load path
    // (load input is always undefined for this plugin; user config is
    // optional — opencode loads the plugin even when no `options` is
    // provided in opencode.json).
    const plugin = await ThinkSeparator(undefined, undefined)
    assert.ok(plugin, "plugin object must be defined")
    assert.equal(
        typeof plugin["experimental.chat.messages.transform"],
        "function",
        "experimental.chat.messages.transform must be a function"
    )
})

test("smoke: hook transforms synthetic reasoning+<think> message into header-bearing text", async () => {
    const plugin = await ThinkSeparator(undefined, undefined)
    const transformHook = plugin["experimental.chat.messages.transform"]

    // Deep-copy the fixture so each test owns its own message instance.
    const messages = [loadSmokeFixture()]

    await transformHook({}, {messages})

    // Both Stage-1 reasoning sources must collapse into a single leading
    // text part. The synthetic message has two reasoning payloads:
    //   1. the `type: "reasoning"` part (opencode-native shape)
    //   2. the embedded `<think>…</think>` block inside the text part
    //      (provider-specific shape)
    // After the hook runs the parts list should be a single text part
    // containing the rendered reasoning block followed by the cleaned
    // final response.
    assert.equal(messages.length, 1, "messages array must not be re-allocated")
    const parts = messages[0].parts
    assert.equal(parts.length, 1, "reasoning parts must collapse into the leading text part")
    assert.equal(parts[0].type, "text")

    const rendered = /** @type {string} */ (parts[0].text)

    // Canonical header — same shape as the unit tests assert in
    // test/pipeline-integration.test.js.
    assert.match(rendered, /── Reasoning ──/, "rendered block must contain the canonical header")

    // Both reasoning sources must surface in the rendered body.
    assert.match(
        rendered,
        /The user pasted a slow dashboard query/,
        "Stage-1 reasoning (type:reasoning part) must be in the rendered body"
    )
    assert.match(
        rendered,
        /The summary should keep the headline metric front-and-centre/,
        "Stage-1 embedded-XML reasoning (<think>…</think>) must be in the rendered body"
    )

    // The cleaned final response must be preserved verbatim (minus the
    // stripped <think>…</think> tags).
    assert.match(
        rendered,
        /Here is the summary you requested: the dashboard median render time dropped from 1\.8s to 0\.6s/,
        "final response text must be preserved after transform"
    )
    assert.ok(
        !rendered.includes("<think>") && !rendered.includes("</think>"),
        "embedded XML tags must be stripped from the final response"
    )
})

test("smoke: hook tolerates degenerate output shapes without throwing", async () => {
    // These mirror the defensive guards at src/index.js line 377 and
    // protect real opencode sessions from plugin-load crashes when the
    // hook contract drifts upstream.
    const plugin = await ThinkSeparator(undefined, undefined)
    const transformHook = plugin["experimental.chat.messages.transform"]

    await assert.doesNotReject(transformHook({}, undefined))
    await assert.doesNotReject(transformHook({}, {}))
    await assert.doesNotReject(transformHook({}, {messages: undefined}))
    await assert.doesNotReject(transformHook({}, {messages: []}))
})

test("smoke: hook tolerates null options (opencode may pass no user config)", async () => {
    // Real opencode calls the factory with `(input, options)` where
    // `options` can be null/undefined when the user has no plugin
    // entry in opencode.json. The plugin must still load.
    const pluginNull = await ThinkSeparator(/** @type {*} */ (null), /** @type {*} */ (null))
    const pluginUndefined = await ThinkSeparator(undefined, undefined)
    assert.equal(
        typeof pluginNull["experimental.chat.messages.transform"],
        "function",
        "null options must still produce a working chat-messages hook"
    )
    assert.equal(
        typeof pluginUndefined["experimental.chat.messages.transform"],
        "function",
        "undefined options must still produce a working chat-messages hook"
    )
})
