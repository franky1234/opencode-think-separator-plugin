# opencode-think-separator-plugin

An opencode TUI plugin that visually separates the model's reasoning block from its final response.

Provider-agnostic — works with Anthropic (Claude), OpenAI (o3, o1), Google (Gemini 2.5 Pro), and MiniMax (M3). Zero runtime dependencies. Opencode-version-agnostic ≥ 1.15.

## Install

### From source (dev path)

```bash
git clone https://github.com/franky1234/opencode-think-separator-plugin.git
cd opencode-think-separator-plugin
./bin/dev.sh
```

This script symlinks the plugin into `~/.config/opencode/plugins/` and starts opencode.

### From npm (once published)

```bash
npm install -g opencode-think-separator-plugin
```

Then add to your `~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["opencode-think-separator-plugin"]
}
```

## How it works

When the LLM produces a response that includes reasoning (chain-of-thought, extended thinking, internal monologue), opencode emits it as a separate `type: "reasoning"` part. This plugin intercepts the message stream and rewrites each reasoning part into a text part prefixed with a visual separator:

```
── Reasoning ──
  The model thinks step by step here...

  This is the final, visible response.
```

Reasoning appears in dim text with a bold/underlined header. The final response is in normal weight below, separated by a blank line.

The detection layer also covers providers that emit reasoning in non-standard shapes (Anthropic/MiniMax `content[]` blocks with `type: "thinking"`, OpenAI top-level `reasoning_content`, Google top-level `thoughts`) as defense-in-depth.

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
  "plugin": [
    ["opencode-think-separator-plugin", { "label": "Thinking" }]
  ]
}
```

Unknown keys in the options are silently ignored (forward-compat).

## Compatibility

| opencode version | Status |
|---|---|
| 1.18.18 | ✓ verified |
| 1.15 – 1.17 | untested, expected to work |

See [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) for the full matrix and expansion plan.

## Known limitations (v0.1.0)

- **Reasoning is rewritten at message-complete time**, not during streaming. Reasoning content only becomes visible after the message finishes generating.
- **The TUI sidebar indicator** is stubbed (returns `null`) because the canonical JSX shape requires the opencode host's `@opentui/solid` transform, which is unverified for plain `.js` plugin files. The headline feature (the visual separator in messages) works regardless. See [progress.md TODO](.superpowers/sdd/think-separator-0.1.0/progress.md) for the follow-up.
- **Fixtures are synthetic**, not captured from real provider responses. They will be replaced before v1.0.0 — see [test/fixtures/README.md](test/fixtures/README.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).