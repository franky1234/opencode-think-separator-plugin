import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import plugin, { setupV2 } from "../nah-policy.js"

/**
 * A minimal V2 context mock. Records every `session.hook` / `tool.hook`
 * registration and returns a trackable `{dispose}` per registration so the
 * adapter's cleanup path can be exercised without a real opencode runtime.
 *
 * @param {string} directory - `ctx.location.directory` (where the policy.yaml lives).
 * @returns {{ctx: Record<string, unknown>, calls: Array<{domain: string, name: string, cb: Function}>, disposals: Array<{disposed: boolean}>}}
 */
function makeMockCtx(directory) {
  /** @type {Array<{domain: string, name: string, cb: Function}>} */
  const calls = []
  /** @type {Array<{disposed: boolean}>} */
  const disposals = []
  const makeDomain = (domain) => ({
    hook: async (name, cb) => {
      calls.push({ domain, name, cb })
      const reg = {
        disposed: false,
        dispose: async () => {
          reg.disposed = true
          disposals.push(reg)
        },
      }
      return reg
    },
  })
  const ctx = {
    location: { directory },
    session: makeDomain("session"),
    tool: makeDomain("tool"),
  }
  return { ctx, calls, disposals }
}

test("V2: default export exposes id, server, and setup", () => {
  assert.equal(plugin.id, "nah-policy")
  assert.equal(typeof plugin.server, "function")
  assert.equal(typeof plugin.setup, "function")
  assert.equal(plugin.setup, setupV2)
})

test("V2: setup(mockCtx) resolves to a dispose function", async () => {
  const dir = mkdtempSync(join(tmpdir(), "nah-v2-"))
  try {
    const { ctx } = makeMockCtx(dir)
    const dispose = await plugin.setup(ctx)
    assert.equal(typeof dispose, "function")
    await assert.doesNotReject(dispose())
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("V2: setup registers tool.hook('execute.before')", async () => {
  const dir = mkdtempSync(join(tmpdir(), "nah-v2-"))
  try {
    const { ctx, calls } = makeMockCtx(dir)
    await plugin.setup(ctx)
    const toolReg = calls.find((c) => c.domain === "tool" && c.name === "execute.before")
    assert.ok(toolReg, "must register tool.hook('execute.before')")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("V2: execute.before callback denies a curl call when network_outbound is deny", async () => {
  const dir = mkdtempSync(join(tmpdir(), "nah-v2-"))
  try {
    mkdirSync(join(dir, ".opencode/nah"), { recursive: true })
    writeFileSync(join(dir, ".opencode/nah/policy.yaml"), "defaults:\n  network_outbound: deny\n")
    const { ctx, calls } = makeMockCtx(dir)
    await plugin.setup(ctx)
    const toolReg = calls.find((c) => c.domain === "tool" && c.name === "execute.before")
    await assert.rejects(
      toolReg.cb({
        tool: "bash",
        sessionID: "ses_1",
        agent: "dev-todo-cli",
        messageID: "msg_1",
        id: "call_1",
        input: { command: "curl https://x.com" },
      }),
      /denied by policy/,
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("V2: execute.before callback passes the event's agent through to agent rules", async () => {
  const dir = mkdtempSync(join(tmpdir(), "nah-v2-"))
  try {
    mkdirSync(join(dir, ".opencode/nah"), { recursive: true })
    writeFileSync(
      join(dir, ".opencode/nah/policy.yaml"),
      "defaults:\n  network_outbound: allow\nagents:\n  qa:\n    network_outbound: deny\n",
    )
    const { ctx, calls } = makeMockCtx(dir)
    await plugin.setup(ctx)
    const toolReg = calls.find((c) => c.domain === "tool" && c.name === "execute.before")

    const event = {
      tool: "bash",
      sessionID: "ses_1",
      agent: "qa",
      messageID: "msg_1",
      id: "call_1",
      input: { command: "curl https://x.com" },
    }
    await assert.rejects(toolReg.cb(event), /denied by policy \(agent: qa/)

    // A different agent with no deny rule must pass through.
    await assert.doesNotReject(toolReg.cb({ ...event, agent: "dev-todo-cli" }))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("V2: dispose() disposes every registration", async () => {
  const dir = mkdtempSync(join(tmpdir(), "nah-v2-"))
  try {
    const { ctx, disposals } = makeMockCtx(dir)
    const dispose = await plugin.setup(ctx)
    assert.equal(disposals.length, 0)
    await dispose()
    assert.equal(disposals.length, 1)
    assert.equal(disposals[0].disposed, true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
