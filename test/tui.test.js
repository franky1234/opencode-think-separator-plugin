import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeSidebar } from '../src/sidebar.js';

const LABEL = 'Reasoning';

function assistantMessage(parts) {
  return { info: { role: 'assistant' }, parts };
}

test('summarizeSidebar returns null for an empty session', () => {
  assert.equal(summarizeSidebar([], LABEL), null);
});

test('summarizeSidebar returns null when no message carries the label', () => {
  const messages = [assistantMessage([{ type: 'text', text: 'plain answer' }])];
  assert.equal(summarizeSidebar(messages, LABEL), null);
});

test('summarizeSidebar counts a single reasoning-tagged message', () => {
  const messages = [assistantMessage([{ type: 'text', text: `${LABEL}: deep thought` }])];
  assert.deepEqual(summarizeSidebar(messages, LABEL), {
    count: 1,
    text: `${LABEL}: 1 message`,
  });
});

test('summarizeSidebar pluralizes the count', () => {
  const messages = [
    assistantMessage([{ type: 'text', text: `${LABEL}: first` }]),
    assistantMessage([{ type: 'text', text: `${LABEL}: second` }]),
    assistantMessage([{ type: 'text', text: `${LABEL}: third` }]),
  ];
  assert.deepEqual(summarizeSidebar(messages, LABEL), {
    count: 3,
    text: `${LABEL}: 3 messages`,
  });
});

test('summarizeSidebar ignores non-assistant messages', () => {
  const messages = [
    { info: { role: 'user' }, parts: [{ type: 'text', text: `${LABEL}: user echo` }] },
  ];
  assert.equal(summarizeSidebar(messages, LABEL), null);
});

test('summarizeSidebar requires a text part containing the label', () => {
  const messages = [
    assistantMessage([{ type: 'text', text: 'no label here' }]),
    assistantMessage([{ type: 'reasoning', text: `${LABEL}: raw reasoning` }]),
  ];
  assert.equal(summarizeSidebar(messages, LABEL), null);
});

test('summarizeSidebar respects a custom label', () => {
  const messages = [assistantMessage([{ type: 'text', text: 'Thinking: deep' }])];
  assert.deepEqual(summarizeSidebar(messages, 'Thinking'), {
    count: 1,
    text: 'Thinking: 1 message',
  });
});
