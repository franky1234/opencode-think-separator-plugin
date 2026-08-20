# think-separator-plugin Architecture

This document describes the plugin's contract, detection heuristic, render pipeline, and configuration API as of v0.1.0.

For the opencode plugin API surface (hooks, signatures, compatibility matrix), see [PLUGIN_API.md](./PLUGIN_API.md).
For the cross-version support matrix, see [COMPATIBILITY.md](./COMPATIBILITY.md).

## 1. Plugin contract

The plugin ships as two exports in `src/index.js` (server-side) and `src/tui.js` (TUI-side). Both consume the same config via `mergeConfig(options)`.

### Server-side `Plugin` (`src/index.js`)

```js
export const ThinkSeparator = async (input, options) => {
  const config = mergeConfig(options || {});
  return {
    'experimental.chat.messages.transform': async (_input, output) => {
      for (const msg of output.messages) {
        if (msg.info.role !== 'assistant') continue;
        transformMessage(msg, config.label);
      }
    }
  };
};
```

The single hook `experimental.chat.messages.transform` rewrites every assistant message before persistence. `transformMessage` (private) handles two cases (see §2).

### TUI-side `TuiPlugin` (`src/tui.js`)

```js
export const ThinkSeparatorTui = async (api, options, meta) => {
  const config = mergeConfig(options || {});
  return {
    slots: { register: [...] }
  };
};
```

Injects a small indicator component into the session sidebar that counts how many messages had reasoning blocks. See the TUI-side code for the exact slot name and JSX shape.

### Dual-side rationale

- **Server-side** is where reasoning is observable (it's part of the message parts). Server transforms run before persistence, so reasoning content is rewritten once and then stored.
- **TUI-side** needs read-only access to `api.state.session.messages(sessionID)` to count reasoning blocks per session. It cannot mutate the messages — that work is already done server-side.
- **Both sides share config** so a single `opencode.json` entry controls label text on both surfaces.

## 2. Detection heuristic

The server hook handles two cases:

### Case 1: opencode-native `type: "reasoning"` parts

opencode normalizes most providers into parts with `type: "reasoning"` and a `text` field. The plugin:

1. Filters parts, extracting all `reasoning` parts' text.
2. Renders the texts via `renderReasoning(text, label)` from `src/render.js`.
3. Concatenates rendered reasoning with existing `text` parts into one new text part at the start.
4. Removes the original reasoning parts (they are now represented visually inside the text).

### Case 2: provider-native reasoning shape (defense-in-depth)

Some providers do not get normalized to `type: "reasoning"` parts by opencode's LLM layer — e.g. Anthropic/MiniMax `content[]` blocks with `type: "thinking"` (note: Anthropic adaptive thinking IS normalized in dev, but for older or non-Anthropic paths this is a safety net), OpenAI `reasoning_content` top-level field, Google `thoughts` top-level field.

The plugin reconstructs a synthetic message shape from the parts and runs `detectReasoning()` from `src/detect-reasoning.js`. If it matches, the plugin prefixes the text with the rendered reasoning block.

### Detection whitelist (`src/detect-reasoning.js`)

```js
export const REASONING_FIELDS = Object.freeze([
  'thinking',
  'reasoning',
  'reasoning_content',
  'reasoning_text',
  'redacted_thinking',
  'thoughts',
  'cot',
  'chain_of_thought',
  'internal_monologue',
  'reflection'
]);
```

The whitelist is exhaustive. Adding a new provider means adding its field name to this list, not editing detection logic.

### Field-to-provider coverage

| Field | Provider(s) | Fixture | Detected |
|---|---|---|---|
| thinking (block) | Anthropic, MiniMax | anthropic-thinking.json | yes |
| reasoning_content | OpenAI | openai-reasoning.json | yes |
| thoughts | Google | google-thoughts.json | yes |
| thinking (block) | MiniMax | minimax-thinking.json | yes |
| (none) | control | no-reasoning-control.json | null |

All fixtures are `synthetic-pending-validation`. See [test/fixtures/README.md](../test/fixtures/README.md).

## 3. Render pipeline

ANSI conventions (locked):

- Header: `BOLD + UNDERLINE + "── <label> ──" + RESET`.
- Reasoning body: `DIM` ... `RESET`, 2-space indent per line.
- Trailing blank line (`\n\n`) separates reasoning from response.
- Response body: no dim, no header — pass-through with 2-space indent per line.

### Sequence

```
message arrives
   │
   ▼
experimental.chat.messages.transform fires
   │
   ▼
Case 1? ──yes──► collect reasoning parts ──► renderReasoning(text, label)
   │                                       │
   │                                       ▼
   │                                  prepend to text parts
   │                                       │
   │                                       ▼
   │                                  remove original reasoning parts
   │
   ├──no──► Case 2 fallback via detectReasoning()
   │
   ▼
transformed msg persisted
   │
   ▼
rendered by TUI with visible separator
   │
   ▼
TUI-side slot reads messages, shows count indicator
```

### Functions (`src/render.js`)

- `renderReasoning(reasoningText, label) -> string` — header + dim body + trailing blank line.
- `renderResponse(responseText) -> string` — 2-space indented, no header, no dim.
- `compose(detection, responseText, label) -> string` — combines the two for callers that want the full block.

## 4. Config API

```js
import { defaultConfig, mergeConfig } from 'think-separator-plugin';

mergeConfig({ label: 'Thinking' });
// -> { label: 'Thinking' }

mergeConfig({});
// -> { label: 'Reasoning' } (= defaultConfig)

mergeConfig({ label: 'X', futureOption: 42 });
// -> { label: 'X' }  (futureOption ignored — forward-compat)
```

Forward-compat guarantees: keys unknown to v0.1.0 are silently dropped. Future versions may add options (e.g. `theme`, `indent`) without invalidating older user configs.

## 5. Synthetic fixture disclaimer

Every fixture in `test/fixtures/*.json` carries `_meta.synthetic: true, validation: "pending"`. They were constructed from public provider API documentation to lock the input shapes. They have **not** been validated against real captured responses.

Replacing synthetic fixtures with real captures is a **DEFER follow-up before v1.0.0**. See `test/fixtures/README.md` for curl invocations per provider.

## 6. Non-goals (MVP)

- No interactive collapse / expand of reasoning block.
- No theme integration (ANSI escapes are fixed).
- No per-provider customization (one whitelist for all).
- No streaming transform (reasoning is rendered in full at message-complete time).

These are tracked as future enhancements, not bugs.