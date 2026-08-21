/**
 * Sidebar indicator summary (TUI-side).
 *
 * Counts assistant messages whose text parts carry the reasoning label
 * (injected server-side by src/index.js) and returns the display text plus
 * the count so the slot can render, or null so the slot renders nothing
 * when there is no reasoning to summarize.
 *
 * Kept free of JSX so it is unit-testable with plain Node; the JSX wrapper
 * lives in src/tui.jsx.
 */

export function summarizeSidebar(messages, label) {
  const count = messages.filter(isReasoningMessage(label)).length;
  if (count === 0) return null;
  return {
    count,
    text: `${label}: ${count} message${count === 1 ? '' : 's'}`,
  };
}

function isReasoningMessage(label) {
  return (message) =>
    message &&
    message.info &&
    message.info.role === 'assistant' &&
    Array.isArray(message.parts) &&
    message.parts.some(isLabeledTextPart(label));
}

function isLabeledTextPart(label) {
  return (part) =>
    part &&
    part.type === 'text' &&
    typeof part.text === 'string' &&
    part.text.includes(label);
}
