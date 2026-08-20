import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectReasoning, REASONING_FIELDS } from '../src/detect-reasoning.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8'));

test('REASONING_FIELDS includes all 10 whitelisted field names', () => {
  for (const f of ['thinking','reasoning','reasoning_content','reasoning_text','redacted_thinking','thoughts','cot','chain_of_thought','internal_monologue','reflection']) {
    assert.ok(REASONING_FIELDS.includes(f), `missing ${f}`);
  }
});

test('detectReasoning finds Anthropic thinking block in content[]', () => {
  const msg = fixture('anthropic-thinking.json');
  const r = detectReasoning(msg);
  assert.ok(r, 'should detect');
  assert.equal(r.source, 'thinking');
  assert.equal(r.kind, 'block');
  assert.match(r.reasoning, /user wants X/);
});

test('detectReasoning finds OpenAI reasoning_content top-level field', () => {
  const msg = fixture('openai-reasoning.json');
  const r = detectReasoning(msg);
  assert.ok(r);
  assert.equal(r.source, 'reasoning_content');
  assert.equal(r.kind, 'field');
});

test('detectReasoning finds Google thoughts top-level field', () => {
  const msg = fixture('google-thoughts.json');
  const r = detectReasoning(msg);
  assert.ok(r);
  assert.equal(r.source, 'thoughts');
  assert.equal(r.kind, 'field');
});

test('detectReasoning finds MiniMax thinking block in content[]', () => {
  const msg = fixture('minimax-thinking.json');
  const r = detectReasoning(msg);
  assert.ok(r);
  assert.equal(r.source, 'thinking');
  assert.equal(r.kind, 'block');
});

test('detectReasoning returns null for control fixture (no reasoning)', () => {
  const msg = fixture('no-reasoning-control.json');
  assert.equal(detectReasoning(msg), null);
});