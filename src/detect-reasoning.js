/**
 * Provider-agnostic reasoning-block detector.
 *
 * Strategy:
 *   1. Scan message.content[] for blocks whose `type` is in REASONING_FIELDS
 *      (Anthropic / MiniMax style: { type: "thinking", thinking: "..." }).
 *   2. Scan top-level message.<field> for fields in REASONING_FIELDS
 *      (OpenAI / Google style: message.reasoning_content = "...").
 *
 * Whitelist is exhaustive — no guessing, no substring matching. Adding a new
 * provider means adding its field name to REASONING_FIELDS, not editing logic.
 */

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

const REASONING_SET = new Set(REASONING_FIELDS);

export function detectReasoning(message) {
  if (!message || typeof message !== 'object') return null;

  if (Array.isArray(message.content)) {
    for (const block of message.content) {
      if (block && typeof block === 'object' && REASONING_SET.has(block.type)) {
        const text = block[block.type];
        if (typeof text === 'string' && text.length > 0) {
          return { reasoning: text, source: block.type, kind: 'block' };
        }
      }
    }
  }

  for (const field of REASONING_FIELDS) {
    if (field in message && typeof message[field] === 'string' && message[field].length > 0) {
      return { reasoning: message[field], source: field, kind: 'field' };
    }
  }

  return null;
}