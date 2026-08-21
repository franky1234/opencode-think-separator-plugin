/**
 * opencode-think-separator-plugin — server-side entry.
 *
 * Rewrites reasoning parts in assistant messages so that the reasoning
 * block is rendered with a visual separator above the final response.
 *
 * Mechanism: experimental.chat.messages.transform receives all messages
 * before persistence. For each assistant message, any `type: "reasoning"`
 * part is converted into a text part prefixed with `── Reasoning ──`,
 * dim-formatted via src/render.js. The original reasoning part is removed
 * because it is now represented visually inside the text part.
 *
 * Defense-in-depth: providers that emit reasoning in a non-standard shape
 * (e.g. Anthropic/MiniMax `content[]` blocks with type "thinking",
 * OpenAI `reasoning_content` top-level field) are also detected and
 * surfaced, even though opencode normalizes most providers to
 * `type: "reasoning"` parts internally.
 *
 * Module contract: opencode v1 plugins default-export `{ id, server }`
 * (see packages/opencode/src/plugin/shared.ts `readV1Plugin`). We do NOT
 * rely on the v0 "enumerated exports" fallback because it iterates every
 * module export and would mistake the `transformMessage` helper (exported
 * here for testability) for a second plugin function.
 */

import { detectReasoning } from './detect-reasoning.js';
import { renderReasoning } from './render.js';
import { mergeConfig } from './config.js';

export const ThinkSeparator = async (input, options) => {
  const config = mergeConfig(options || {});
  return {
    'experimental.chat.messages.transform': async (_hookInput, output) => {
      for (const msg of output.messages) {
        if (msg.info.role !== 'assistant') continue;
        transformMessage(msg, config.label);
      }
    },
  };
};

export function transformMessage(msg, label) {
  const parts = msg.parts;

  // Case 1: opencode-native `type: "reasoning"` parts (most providers).
  // Convert each into a text part with header + dim body, drop the original.
  const reasoningTexts = [];
  const remaining = [];
  for (const part of parts) {
    if (part && part.type === 'reasoning' && typeof part.text === 'string' && part.text.length > 0) {
      reasoningTexts.push(part.text);
    } else {
      remaining.push(part);
    }
  }

  if (reasoningTexts.length > 0) {
    const reasoningBlock = reasoningTexts
      .map((t) => renderReasoning(t, label))
      .join('\n');
    const newTextPart = {
      ...remaining[0],
      type: 'text',
      text: reasoningBlock + extractTextFromParts(remaining),
    };
    msg.parts = [newTextPart, ...remaining.slice(1)];
    return;
  }

  // Case 2: provider-native reasoning shape (defense-in-depth).
  // Reconstruct a synthetic message shape and pass to detectReasoning.
  const synthetic = {
    content: parts
      .filter((p) => p && (p.type === 'text' || p.type === 'thinking'))
      .map((p) => ({
        type: p.type === 'thinking' ? 'thinking' : 'text',
        [p.type === 'thinking' ? 'thinking' : 'text']: p.text,
      })),
  };
  const detection = detectReasoning(synthetic);
  if (!detection) return;
  const reasoningBlock = renderReasoning(detection.reasoning, label);
  const existingText = extractTextFromParts(parts);
  msg.parts = [
    { ...parts[0], type: 'text', text: reasoningBlock + existingText },
    ...parts.slice(1),
  ];
}

function extractTextFromParts(parts) {
  return parts
    .filter((p) => p && p.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text)
    .join('\n');
}

export default {
  id: 'opencode-think-separator-plugin',
  server: ThinkSeparator,
};
