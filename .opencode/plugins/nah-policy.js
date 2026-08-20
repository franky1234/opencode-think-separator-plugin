import { readFileSync, appendFileSync } from "fs"
import { join } from "path"

export const TOOL_INTENT = {
  read: "filesystem_read",
  glob: "filesystem_read",
  grep: "filesystem_read",
  list: "filesystem_read",
  write: "filesystem_write",
  edit: "filesystem_write",
  apply_patch: "filesystem_write",
  task: "agent_delegate",
}

export function classifyBash(command) {
  const cmd = (command || "").trim().toLowerCase()
  if (/^(rm|unlink|del|rmdir)\b/.test(cmd)) return "filesystem_delete"
  if (/\b(curl|wget|httpie|fetch|https?:\/\/)\b/.test(cmd)) return "network_outbound"
  if (/\b(pip|pip3|poetry|pdm|conda)\s+install\b/.test(cmd)) return "package_install"
  if (/\b(npm|pnpm|yarn|bun)\s+(install|add)\b/.test(cmd)) return "package_install"
  return "lang_exec"
}

export function parsePolicy(content) {
  const result = {
    defaults: {},
    agents: {},
    unattended: { enabled_when_env: null, resolve_ask_as: "deny", log_denied_to: null },
  }
  const lines = content.split("\n")
  let section = null
  let currentAgent = null
  let currentIndent = 0

  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "").trimEnd()
    if (!line.trim()) continue

    const indent = raw.length - raw.trimStart().length

    if (indent === 0 && line.endsWith(":")) {
      section = line.slice(0, -1)
      currentAgent = null
      if (section === "unattended_mode") continue
      continue
    }

    if (section === "unattended_mode" && indent >= 2) {
      const m = line.trim().match(/^([a-z_]+):\s*"?([^"\s]+)"?/)
      if (m) result.unattended[m[1]] = m[2]
      continue
    }

    if (section === "defaults" && indent >= 2) {
      const m = line.trim().match(/^([a-z_]+):\s*(\S+)/)
      if (m) result.defaults[m[1]] = m[2]
      continue
    }

    if (section === "agents") {
      if (indent === 2 && line.endsWith(":")) {
        currentAgent = line.trim().slice(0, -1)
        result.agents[currentAgent] = { description: undefined, rules: {} }
        continue
      }
      if (currentAgent && indent >= 4) {
        const m = line.trim().match(/^([a-z_-]+):\s*(?:"([^"]*)"|(\S+))/)
        if (m) {
          const key = m[1]
          const val = m[2] !== undefined ? m[2] : m[3]
          if (key === "description") {
            result.agents[currentAgent].description = val
          } else {
            result.agents[currentAgent].rules[key] = val
          }
        }
      }
    }
  }
  return result
}

export function loadPolicy(directory) {
  try {
    const path = join(directory, ".opencode/nah/policy.yaml")
    return parsePolicy(readFileSync(path, "utf8"))
  } catch {
    return {
      defaults: {},
      agents: {},
      unattended: { resolve_ask_as: "deny", log_denied_to: null },
    }
  }
}

export function resolveAction(policy, agentName, intent, env) {
  const agentRules = policy.agents[agentName]?.rules || {}
  const declared = agentRules[intent] ?? policy.defaults[intent] ?? "allow"

  const unattendedEnabled = env?.NAH_UNATTENDED === "1"
  if (unattendedEnabled && declared === "ask") {
    return { action: "deny", originalAction: declared, unattended: true }
  }
  return { action: declared, originalAction: declared, unattended: false }
}

export const NahPolicyPlugin = async ({ directory, $, client }) => {
  const policy = loadPolicy(directory)
  const logPath = policy.unattended.log_denied_to
    ? join(directory, policy.unattended.log_denied_to)
    : null

  function logDenial(agent, intent, tool, originalAction) {
    if (!logPath) return
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      agent,
      intent,
      tool,
      original_action: originalAction,
      resolved_action: "deny",
      reason: "unattended_mode",
    }) + "\n"
    try { appendFileSync(logPath, line) } catch {}
  }

  function intentFor(tool, args) {
    if (tool === "bash") return classifyBash(args?.command || "")
    return TOOL_INTENT[tool]
  }

  // The tool.execute.before hook input only carries {tool, sessionID, callID}.
  // 'agent' is NOT in the contract — we resolve it by looking up the session
  // via the opencode client. If the client call fails or returns no agent,
  // fall back to "default" (which uses only policy.defaults).
  async function agentNameFor(sessionID) {
    if (!client || !sessionID) return "default"
    try {
      const session = await client.session.get({ id: sessionID })
      return session?.agent?.name || session?.agent || "default"
    } catch {
      return "default"
    }
  }

  return {
    "tool.execute.before": async (input, output) => {
      const intent = intentFor(input.tool, output.args)
      if (!intent) return
      const agentName = input.agent || await agentNameFor(input.sessionID)
      const { action, originalAction, unattended } = resolveAction(policy, agentName, intent, process.env)

      if (action === "deny") {
        if (unattended) logDenial(agentName, intent, input.tool, originalAction)
        throw new Error(`[nah] ${input.tool} denied by policy (agent: ${agentName}, intent: ${intent})`)
      }

      if (action === "ask") {
        const reason = `[nah] ${input.tool} requires confirmation (agent: ${agentName}, intent: ${intent})`
        if (process.stdout.isTTY) {
          await new Promise((resolve, reject) => {
            process.stderr.write(`${reason}\n  Press Enter to allow, Ctrl+C to deny.\n`)
            process.stdin.once("data", () => resolve())
            process.stdin.once("close", () => reject(new Error(reason)))
          })
        } else {
          throw new Error(reason)
        }
      }
    },
  }
}

export default NahPolicyPlugin
