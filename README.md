# opencode-think-separator-plugin

An opencode TUI plugin that visually separates the model's reasoning block from its final response.

Provider-agnostic — works with Anthropic (Claude), OpenAI (o3, o1), Google (Gemini 2.5 Pro), and MiniMax (M3). Zero runtime dependencies. Opencode-version-agnostic ≥ 1.15.

## Install

### Recommended: edit `~/.config/opencode/opencode.json`

Add the plugin to your existing config:

```json
{
    "plugin": ["opencode-think-separator-plugin"]
}
```

opencode auto-installs npm packages on startup ([docs](https://opencode.ai/docs/plugins/#how-plugins-are-installed)). No `npm install -g` step required — the package is fetched into `~/.cache/opencode/node_modules/` at first run.

### Alternative: one-shot installer

```bash
npx opencode-think-separator-plugin-install
```

This writes the plugin entry into your `opencode.json` and prints a "restart opencode" prompt.

### From source (dev path)

```bash
git clone https://github.com/franky1234/think-separator-plugin.git
cd think-separator-plugin
./bin/dev.sh
```

`bin/dev.sh` symlinks the source into `~/.config/opencode/plugins/` and starts opencode.

## How it works

When the LLM produces a response that includes reasoning (chain-of-thought, extended thinking, internal monologue), opencode emits it as a separate `type: "reasoning"` part or inside embedded tags like `<think>...</think>`. This plugin intercepts the message stream and rewrites each reasoning section into a formatted block prefixed with a visual separator:

```markdown
> ### ── Reasoning ──
> *The model thinks step by step here...*

This is the final, visible response.
```

Reasoning appears inside an italicized blockquote with a styled header, followed by a blank line before the final response.

The detection layer covers:

- **Native reasoning/thinking parts**: Anthropic, MiniMax, OpenAI, Google.
- **Embedded XML reasoning tags in text**: `<think>`, `<thought>`, `<antThinking>`, `<reasoning>`, `<thought_process>`, `<chain_of_thought>` (e.g. MiniMax, DeepSeek-R1, Qwen, Ollama).
- **Non-standard top-level fields** (`reasoning_content`, `thoughts`) as defense-in-depth.

For full architecture details see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Configuration

Default config:

```json
{
    "label": "Reasoning"
}
```

Override the header label by passing options to the plugin in `opencode.json`:

```json
{
    "plugin": [["opencode-think-separator-plugin", {"label": "Thinking"}]]
}
```

Unknown keys in the options are silently ignored (forward-compat).

## Compatibility

| opencode version | Status                     |
| ---------------- | -------------------------- |
| 1.18.18          | ✓ verified                 |
| 1.15 – 1.17      | untested, expected to work |

See [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) for the full matrix and expansion plan.

## Known limitations (v0.2.0)

- **Reasoning is rewritten at message-complete time**, not during streaming. Reasoning content only becomes visible after the message finishes generating.
- **Fixtures are synthetic**, not captured from real provider responses. They will be replaced before v1.0.0 — see [test/fixtures/README.md](test/fixtures/README.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).
