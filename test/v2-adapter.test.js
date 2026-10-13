import assert from "node:assert/strict"
import {test} from "node:test"
import plugin, {setupV2} from "../src/index.js"

/**
 * A minimal V2 context mock. Records every `session.hook` / `tool.hook`
 * registration and returns a trivial `{dispose}` per registration so the
 * adapter's cleanup path can be exercised without a real opencode runtime.
 *
 * @param {Record<string, unknown>} [options] - Plugin user config (`ctx.options`).
 * @returns {{ctx: Record<string, unknown>, calls: Array<{domain: string, name: string, cb: Function}>}}
 */
function makeMockCtx(options) {
    /** @type {Array<{domain: string, name: string, cb: Function}>} */
    const calls = []
    const makeDomain = (domain) => ({
        hook: async (name, cb) => {
            calls.push({domain, name, cb})
            return {dispose: async () => {}}
        }
    })
    const ctx = {
        options,
        session: makeDomain("session"),
        tool: makeDomain("tool")
    }
    return {ctx, calls}
}

test("V2: default export exposes id, server, and setup", () => {
    assert.equal(typeof plugin.id, "string")
    assert.equal(plugin.id, "opencode-think-separator-plugin")
    assert.equal(typeof plugin.server, "function")
    assert.equal(typeof plugin.setup, "function")
    assert.equal(plugin.setup, setupV2)
})

test("V2: setup(mockCtx) resolves to a dispose function", async () => {
    const {ctx} = makeMockCtx()
    const dispose = await plugin.setup(ctx)
    assert.equal(typeof dispose, "function")
    // dispose must be callable without a real runtime (no-op registrations).
    await assert.doesNotReject(dispose())
})

test("V2: setup registers the message transform via session.hook('context')", async () => {
    const {ctx, calls} = makeMockCtx()
    await plugin.setup(ctx)

    const transformCall = calls.find((c) => c.domain === "session" && c.name === "context")
    assert.ok(transformCall, "must register the message transform via session.hook('context')")

    // V2 `context` events carry a single mutable `messages` array (plus model /
    // sessionID). The adapter must translate that event into the V1
    // `(input, output)` shape before delegating to the V1 transform hook.
    const event = {
        sessionID: "ses_123",
        model: {providerID: "minimax", id: "MiniMax-M3"},
        messages: [
            {info: {role: "assistant"}, parts: [{type: "reasoning", text: "hidden thought"}]}
        ]
    }
    await transformCall.cb(event)

    assert.equal(event.messages[0].parts[0].type, "text")
    assert.ok(
        event.messages[0].parts[0].text.startsWith("> ### ── Reasoning ──"),
        "reasoning part must be rewritten into the styled text block"
    )
    assert.match(event.messages[0].parts[0].text, /hidden thought/)
})

test("V2: setup does NOT register the compaction hook by default", async () => {
    const {ctx, calls} = makeMockCtx()
    await plugin.setup(ctx)
    const compactionCall = calls.find((c) => c.domain === "session" && c.name === "compaction")
    assert.equal(
        compactionCall,
        undefined,
        "compaction hook is opt-in via compaction.stripReasoning"
    )
})

test("V2: setup registers the compaction hook when compaction.stripReasoning is enabled", async () => {
    const {ctx, calls} = makeMockCtx({compaction: {stripReasoning: true}})
    await plugin.setup(ctx)

    const compactionCall = calls.find((c) => c.domain === "session" && c.name === "compaction")
    assert.ok(
        compactionCall,
        "must register session.hook('compaction') when compaction.stripReasoning"
    )

    // V2 compaction events carry `system` text parts (no `output.context` array).
    // The adapter must fold the directive into `event.system`.
    const event = {sessionID: "ses_123", system: []}
    await compactionCall.cb(event)

    assert.equal(event.system.length, 1)
    assert.ok(
        event.system[0].text.includes("Discard all reasoning blocks"),
        "directive must be folded into the system text parts"
    )
})
