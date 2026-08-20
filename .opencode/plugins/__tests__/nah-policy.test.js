import { test, suite } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import {
  TOOL_INTENT,
  classifyBash,
  parsePolicy,
  loadPolicy,
  resolveAction,
  NahPolicyPlugin,
} from "../nah-policy.js"

suite("nah-policy plugin", () => {
  test("plugin loads and returns a hook", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nah-test-"))
    try {
      const hooks = await NahPolicyPlugin({ directory: dir })
      assert.equal(typeof hooks, "object")
      assert.equal(typeof hooks["tool.execute.before"], "function")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("plugin loads even when policy.yaml is missing (fail-open)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nah-test-"))
    try {
      const hooks = await NahPolicyPlugin({ directory: dir })
      assert.ok(hooks["tool.execute.before"])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("TOOL_INTENT maps built-in tools to intents", () => {
    assert.equal(TOOL_INTENT.read, "filesystem_read")
    assert.equal(TOOL_INTENT.glob, "filesystem_read")
    assert.equal(TOOL_INTENT.grep, "filesystem_read")
    assert.equal(TOOL_INTENT.write, "filesystem_write")
    assert.equal(TOOL_INTENT.edit, "filesystem_write")
    assert.equal(TOOL_INTENT.apply_patch, "filesystem_write")
    assert.equal(TOOL_INTENT.task, "agent_delegate")
  })

  test("classifyBash: rm is filesystem_delete", () => {
    assert.equal(classifyBash("rm -rf node_modules"), "filesystem_delete")
    assert.equal(classifyBash("unlink foo.txt"), "filesystem_delete")
    assert.equal(classifyBash("rmdir build"), "filesystem_delete")
  })

  test("classifyBash: curl/wget is network_outbound", () => {
    assert.equal(classifyBash("curl https://example.com"), "network_outbound")
    assert.equal(classifyBash("wget https://example.com/file.tar.gz"), "network_outbound")
    assert.equal(classifyBash("echo foo && curl https://x.com"), "network_outbound")
  })

  test("classifyBash: pip/npm install is package_install", () => {
    assert.equal(classifyBash("pip install requests"), "package_install")
    assert.equal(classifyBash("npm install react"), "package_install")
    assert.equal(classifyBash("pnpm add vue"), "package_install")
    assert.equal(classifyBash("yarn add typescript"), "package_install")
  })

  test("classifyBash: python/node defaults to lang_exec", () => {
    assert.equal(classifyBash("python script.py"), "lang_exec")
    assert.equal(classifyBash("node index.js"), "lang_exec")
    assert.equal(classifyBash("ls -la"), "lang_exec")
  })

  test("classifyBash: empty/garbage command defaults to lang_exec", () => {
    assert.equal(classifyBash(""), "lang_exec")
    assert.equal(classifyBash("   "), "lang_exec")
  })

  test("parsePolicy: extracts defaults, agents, and unattended_mode", () => {
    const yaml = `
defaults:
  filesystem_read: allow
  filesystem_write: allow
  filesystem_delete: ask
  network_outbound: ask
  lang_exec: allow
  package_install: ask
  agent_delegate: allow

agents:
  orchestrator:
    description: "Read-only planner"
    filesystem_write: deny
    filesystem_delete: deny
    lang_exec: deny
    network_outbound: deny
    package_install: deny

  dev-todo-cli:
    description: "Full coding power"
    filesystem_read: allow
    filesystem_write: allow
    filesystem_delete: ask

  qa:
    description: "Runs pytest"
    filesystem_write: deny
    filesystem_delete: deny
    network_outbound: deny

unattended_mode:
  enabled_when_env: "NAH_UNATTENDED=1"
  resolve_ask_as: deny
  log_denied_to: ".harness/nah-denied.jsonl"
`
    const policy = parsePolicy(yaml)
    assert.equal(policy.defaults.filesystem_read, "allow")
    assert.equal(policy.defaults.filesystem_delete, "ask")
    assert.equal(policy.agents.orchestrator.rules.filesystem_write, "deny")
    assert.equal(policy.agents.orchestrator.description, "Read-only planner")
    assert.equal(policy.agents["dev-todo-cli"].rules.filesystem_write, "allow")
    assert.equal(policy.agents.qa.rules.filesystem_write, "deny")
    assert.equal(policy.unattended.enabled_when_env, "NAH_UNATTENDED=1")
    assert.equal(policy.unattended.resolve_ask_as, "deny")
    assert.equal(policy.unattended.log_denied_to, ".harness/nah-denied.jsonl")
  })

  test("parsePolicy: handles comments and blank lines", () => {
    const yaml = `
# Top-level comment
defaults:
  # inline comment
  filesystem_read: allow

  lang_exec: allow
`
    const policy = parsePolicy(yaml)
    assert.equal(policy.defaults.filesystem_read, "allow")
    assert.equal(policy.defaults.lang_exec, "allow")
  })

  test("parsePolicy: missing agents section yields empty agents map", () => {
    const yaml = `
defaults:
  filesystem_read: allow
`
    const policy = parsePolicy(yaml)
    assert.deepEqual(policy.agents, {})
    assert.equal(policy.defaults.filesystem_read, "allow")
  })

  test("loadPolicy: reads from .opencode/nah/policy.yaml", () => {
    const dir = mkdtempSync(join(tmpdir(), "nah-test-"))
    try {
      const policyDir = join(dir, ".opencode/nah")
      mkdirSync(policyDir, { recursive: true })
      writeFileSync(join(policyDir, "policy.yaml"),
        "defaults:\n  filesystem_read: allow\n")
      const policy = loadPolicy(dir)
      assert.equal(policy.defaults.filesystem_read, "allow")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("resolveAction: agent override beats default", () => {
    const policy = {
      defaults: { filesystem_write: "allow" },
      agents: {
        orchestrator: { rules: { filesystem_write: "deny" } },
      },
    }
    assert.equal(resolveAction(policy, "orchestrator", "filesystem_write", {}).action, "deny")
  })

  test("resolveAction: falls back to default when agent has no rule", () => {
    const policy = {
      defaults: { filesystem_write: "allow" },
      agents: {
        orchestrator: { rules: { filesystem_write: "deny" } },
      },
    }
    assert.equal(resolveAction(policy, "dev-todo-cli", "filesystem_write", {}).action, "allow")
  })

  test("resolveAction: unknown intent defaults to allow", () => {
    const policy = { defaults: {}, agents: {} }
    assert.equal(resolveAction(policy, "any", "unknown_intent", {}).action, "allow")
  })

  test("resolveAction: unknown agent uses only defaults", () => {
    const policy = {
      defaults: { filesystem_read: "allow" },
      agents: { orchestrator: { rules: { filesystem_read: "deny" } } },
    }
    assert.equal(resolveAction(policy, "stranger", "filesystem_read", {}).action, "allow")
  })

  test("resolveAction: NAH_UNATTENDED=1 converts ask to deny", () => {
    const policy = {
      defaults: { filesystem_delete: "ask" },
      agents: {},
    }
    const result = resolveAction(policy, "dev-todo-cli", "filesystem_delete", { NAH_UNATTENDED: "1" })
    assert.equal(result.action, "deny")
    assert.equal(result.originalAction, "ask")
    assert.equal(result.unattended, true)
  })

  test("resolveAction: NAH_UNATTENDED=0 keeps ask as ask", () => {
    const policy = {
      defaults: { filesystem_delete: "ask" },
      agents: {},
    }
    const result = resolveAction(policy, "dev-todo-cli", "filesystem_delete", { NAH_UNATTENDED: "0" })
    assert.equal(result.action, "ask")
    assert.equal(result.unattended, false)
  })

  test("hook: allows filesystem_read for any agent", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nah-test-"))
    try {
      mkdirSync(join(dir, ".opencode/nah"), { recursive: true })
      writeFileSync(join(dir, ".opencode/nah/policy.yaml"),
        "defaults:\n  filesystem_read: allow\n")
      const hooks = await NahPolicyPlugin({ directory: dir })
      await hooks["tool.execute.before"]({ tool: "read", agent: "orchestrator" }, { args: { filePath: "/x" } })
      await hooks["tool.execute.before"]({ tool: "read", agent: "dev-todo-cli" }, { args: { filePath: "/x" } })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("hook: throws on deny", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nah-test-"))
    try {
      mkdirSync(join(dir, ".opencode/nah"), { recursive: true })
      writeFileSync(join(dir, ".opencode/nah/policy.yaml"),
        "defaults:\n  network_outbound: deny\n")
      const hooks = await NahPolicyPlugin({ directory: dir })
      await assert.rejects(
        hooks["tool.execute.before"]({ tool: "bash", agent: "dev-todo-cli" }, { args: { command: "curl https://x.com" } }),
        /denied by policy/,
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("hook: ask throws in non-TTY (CI / unattended)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nah-test-"))
    const origTTY = process.stdout.isTTY
    Object.defineProperty(process.stdout, "isTTY", { value: false, configurable: true })
    try {
      mkdirSync(join(dir, ".opencode/nah"), { recursive: true })
      writeFileSync(join(dir, ".opencode/nah/policy.yaml"),
        "defaults:\n  filesystem_delete: ask\n")
      const hooks = await NahPolicyPlugin({ directory: dir })
      await assert.rejects(
        hooks["tool.execute.before"]({ tool: "bash", agent: "dev-todo-cli" }, { args: { command: "rm foo" } }),
        /requires confirmation/,
      )
    } finally {
      Object.defineProperty(process.stdout, "isTTY", { value: origTTY, configurable: true })
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("hook: unknown tool is pass-through", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nah-test-"))
    try {
      mkdirSync(join(dir, ".opencode/nah"), { recursive: true })
      writeFileSync(join(dir, ".opencode/nah/policy.yaml"),
        "defaults:\n  filesystem_read: deny\n")
      const hooks = await NahPolicyPlugin({ directory: dir })
      await hooks["tool.execute.before"]({ tool: "unknown_tool_xyz", agent: "x" }, { args: {} })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("hook: orchestrator cannot write (filesystem_write deny)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nah-test-"))
    try {
      mkdirSync(join(dir, ".opencode/nah"), { recursive: true })
      writeFileSync(join(dir, ".opencode/nah/policy.yaml"),
        "defaults:\n  filesystem_write: allow\n  filesystem_delete: ask\n  lang_exec: allow\n  network_outbound: ask\n  package_install: ask\n  agent_delegate: allow\n  filesystem_read: allow\nagents:\n  orchestrator:\n    filesystem_write: deny\n    filesystem_delete: deny\n    lang_exec: deny\n    network_outbound: deny\n    package_install: deny\n")
      const hooks = await NahPolicyPlugin({ directory: dir })
      await assert.rejects(
        hooks["tool.execute.before"]({ tool: "write", agent: "orchestrator" }, { args: { filePath: "/x" } }),
        /denied by policy \(agent: orchestrator/,
      )
      await assert.rejects(
        hooks["tool.execute.before"]({ tool: "bash", agent: "orchestrator" }, { args: { command: "rm foo" } }),
        /denied by policy \(agent: orchestrator/,
      )
      await assert.rejects(
        hooks["tool.execute.before"]({ tool: "bash", agent: "orchestrator" }, { args: { command: "pytest" } }),
        /denied by policy \(agent: orchestrator/,
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("hook: orchestrator CAN delegate via task tool", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nah-test-"))
    try {
      mkdirSync(join(dir, ".opencode/nah"), { recursive: true })
      writeFileSync(join(dir, ".opencode/nah/policy.yaml"),
        "defaults:\n  agent_delegate: allow\n  filesystem_read: allow\nagents:\n  orchestrator: {}\n")
      const hooks = await NahPolicyPlugin({ directory: dir })
      await hooks["tool.execute.before"]({ tool: "task", agent: "orchestrator" }, { args: { prompt: "do x" } })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("hook: dev-todo-cli CAN write but CANNOT delegate", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nah-test-"))
    try {
      mkdirSync(join(dir, ".opencode/nah"), { recursive: true })
      writeFileSync(join(dir, ".opencode/nah/policy.yaml"),
        "defaults:\n  filesystem_write: allow\n  filesystem_read: allow\n  agent_delegate: allow\nagents:\n  dev-todo-cli:\n    agent_delegate: deny\n")
      const hooks = await NahPolicyPlugin({ directory: dir })
      await hooks["tool.execute.before"]({ tool: "write", agent: "dev-todo-cli" }, { args: { filePath: "/x" } })
      await assert.rejects(
        hooks["tool.execute.before"]({ tool: "task", agent: "dev-todo-cli" }, { args: {} }),
        /denied by policy \(agent: dev-todo-cli/,
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("hook: qa CAN run pytest but CANNOT write or install", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nah-test-"))
    try {
      mkdirSync(join(dir, ".opencode/nah"), { recursive: true })
      writeFileSync(join(dir, ".opencode/nah/policy.yaml"),
        "defaults:\n  filesystem_read: allow\n  filesystem_write: allow\n  filesystem_delete: ask\n  lang_exec: allow\n  network_outbound: ask\n  package_install: ask\n  agent_delegate: allow\nagents:\n  qa:\n    filesystem_write: deny\n    filesystem_delete: deny\n    network_outbound: deny\n    package_install: deny\n    agent_delegate: deny\n")
      const hooks = await NahPolicyPlugin({ directory: dir })
      await hooks["tool.execute.before"]({ tool: "bash", agent: "qa" }, { args: { command: "pytest" } })
      await assert.rejects(
        hooks["tool.execute.before"]({ tool: "write", agent: "qa" }, { args: { filePath: "/x" } }),
        /denied by policy \(agent: qa/,
      )
      await assert.rejects(
        hooks["tool.execute.before"]({ tool: "bash", agent: "qa" }, { args: { command: "pip install requests" } }),
        /denied by policy \(agent: qa/,
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
