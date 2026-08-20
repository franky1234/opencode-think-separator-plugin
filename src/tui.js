/**
 * think-separator-plugin — TUI-side entry.
 *
 * Registers a sidebar slot that counts how many assistant messages in the
 * current session contained reasoning blocks. Reasoning is surfaced
 * server-side (src/index.js) as text parts prefixed with the configured
 * label, so the TUI counts messages whose text parts contain that label.
 *
 * Module contract (opencode v1): default-export `{ id, tui }` where
 * `tui(api, options, meta) => Promise<void>`. The loader reads only the
 * default export and ignores named exports. Slots are registered by
 * calling `api.slots.register({ slots: { <name>(ctx, props) => JSX } })`
 * inside `tui` — not by returning an object.
 *
 * Ref: packages/opencode/specs/tui-plugins.md and
 * .opencode/plugins/tui-smoke.tsx (canonical slot example).
 */

import { mergeConfig } from './config.js';

const tui = async (api, options, meta) => {
  const config = mergeConfig(options || {});

  api.slots.register({
    slots: {
      // `sidebar_content` renders with the slot library default (append)
      // mode, so this indicator stacks non-intrusively below the built-in
      // sidebar blocks. Props carry `{ session_id }`.
      sidebar_content: (ctx, value) => {
        const sessionID = value.session_id;
        const messages = api.state.session.messages(sessionID);
        const count = messages.filter(
          (m) =>
            m.info.role === 'assistant' &&
            Array.isArray(m.parts) &&
            m.parts.some(
              (p) =>
                p &&
                p.type === 'text' &&
                typeof p.text === 'string' &&
                p.text.includes(config.label),
            ),
        ).length;

        if (count === 0) return null;

        // TODO(jsx): return an actual indicator element. The canonical JSX
        // shape (from opencode `.opencode/plugins/tui-smoke.tsx`) is
        // `/** @jsxImportSource @opentui/solid */` with intrinsic <box>/<text>
        // elements, e.g.:
        //
        //   return (
        //     <box border borderColor={ctx.theme.current.border} ...>
        //       <text fg={ctx.theme.current.textMuted}>
        //         {config.label}: {count} message{count === 1 ? '' : 's'}
        //       </text>
        //     </box>
        //   );
        //
        // Blocked: this repo ships a zero-runtime-dependency plain `.js`
        // plugin. JSX requires the host's @opentui/solid transform, and it is
        // not yet verified whether opencode JSX-transforms `.js` (vs `.jsx` /
        // `.tsx`) plugin files. Returning null keeps the slot a valid no-op
        // until that is confirmed in a real TUI run.
        return null;
      },
    },
  });
};

export default {
  id: 'think-separator-plugin',
  tui,
};
