/** @jsxImportSource @opentui/solid */
/**
 * think-separator-plugin — TUI-side entry.
 *
 * Registers a `sidebar_content` slot that counts how many assistant messages
 * in the current session carried a reasoning block (surfaced server-side by
 * src/index.js as text parts prefixed with the configured label) and renders
 * a small boxed indicator.
 *
 * Module contract (opencode v1): default-export `{ id, tui }` where
 * `tui(api, options, meta) => Promise<void>`. The loader reads only the
 * default export; slots register via
 * `api.slots.register({ slots: { name(ctx, props) => JSX } })`.
 *
 * Slot render signature (verified against @opentui/core SlotRenderer and the
 * opencode TUI runtime): `(ctx, props) => JSX` with `ctx = { theme }` and
 * `props = { session_id }`.
 *
 * Loader research (opencode 1.18.x):
 *  - opencode `await import()`s the entry directly; it does NOT JSX-transform
 *    plugin files itself. Bun (opencode's runtime) only JSX-transforms
 *    `.jsx`/`.tsx`, never `.js` — hence this file's extension.
 *  - `@jsxImportSource @opentui/solid` resolves because opencode's TUI
 *    runtime (ensureRuntimePluginSupport) registers a Bun plugin redirecting
 *    `@opentui/*` and `solid-js` imports to the host runtime, and
 *    @opentui/solid@0.5.x ships a real jsx-runtime.
 *  - TUI plugins are NOT auto-discovered from the plugins directory; they
 *    load from tui.json's `plugin` array (see bin/dev.sh).
 */

import { mergeConfig } from './config.js';
import { summarizeSidebar } from './sidebar.js';

const tui = async (api, options, meta) => {
  const config = mergeConfig(options || {});

  api.slots.register({
    slots: {
      // `sidebar_content` renders in append mode, stacking below the built-in
      // sidebar blocks. `props` carries `{ session_id }`.
      sidebar_content: (ctx, props) => {
        const messages = api.state.session.messages(props.session_id);
        const summary = summarizeSidebar(messages, config.label);
        if (summary === null) return null;

        return (
          <box border borderColor={ctx.theme.current.border}>
            <text fg={ctx.theme.current.textMuted}>{summary.text}</text>
          </box>
        );
      },
    },
  });
};

export default {
  id: 'think-separator-plugin',
  tui,
};
