# Test Fixtures

Synthetic JSON responses representing one assistant message each, across the 4 providers we target (Anthropic, OpenAI, Google, MiniMax) plus one control fixture with no reasoning.

## Status

**All fixtures are `synthetic-pending-validation`**. They were constructed from each provider's public API documentation to lock the input shapes the detector must recognize. They have **not** been validated against real captured responses.

Every fixture carries a top-level `_meta` block:

```json
{
  "_meta": {
    "provider": "...",
    "model": "...",
    "synthetic": true,
    "validation": "pending",
    "source_doc": "..."
  }
}
```

## Fixtures

| File | Provider | Model | Reasoning shape | Purpose |
|---|---|---|---|---|
| `anthropic-thinking.json` | Anthropic | claude-sonnet-4.5 | `content[]` block with `type:"thinking"` | Anthropic native shape (also normalized to `type:"reasoning"` parts by opencode) |
| `openai-reasoning.json` | OpenAI | o3 | top-level `reasoning_content` string | OpenAI reasoning model shape |
| `google-thoughts.json` | Google | gemini-2.5-pro | top-level `thoughts` string | Gemini thinking shape |
| `minimax-thinking.json` | MiniMax | MiniMax-M3 | `content[]` block with `type:"thinking"` | MiniMax native shape |
| `no-reasoning-control.json` | OpenAI | gpt-4o | none | Negative control — must NOT detect reasoning |

## Why synthetic?

Real provider responses can only be captured by calling each provider's API with a reasoning-capable model. That requires paid API access and would consume real tokens. For the v0.1.0 MVP we chose to:

1. Construct fixtures from the public API docs (lock the shape we expect).
2. Detect only the whitelisted field names (`thinking`, `reasoning`, `reasoning_content`, `reasoning_text`, `redacted_thinking`, `thoughts`, `cot`, `chain_of_thought`, `internal_monologue`, `reflection`).
3. Mark each fixture as `synthetic: true` so a future contributor or CI step can verify against real captures.

## Replacing synthetic fixtures with real captures

Before v1.0.0 we want to replace each synthetic fixture with a real captured response. The procedure:

### Anthropic
```bash
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-sonnet-4-5",
    "max_tokens": 1024,
    "thinking": { "type": "enabled", "budget_tokens": 500 },
    "messages": [{ "role": "user", "content": "Solve this step by step." }]
  }' | tee test/fixtures/anthropic-thinking.json
```
Then strip `anthropic-ratelimit-*` headers and any auth fields from the captured body.

### OpenAI
```bash
curl https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "content-type: application/json" \
  -d '{
    "model": "o3",
    "reasoning_effort": "medium",
    "messages": [{ "role": "user", "content": "Solve this step by step." }]
  }' | tee test/fixtures/openai-reasoning.json
```

### Google
```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=$GOOGLE_API_KEY" \
  -H "content-type: application/json" \
  -d '{
    "contents": [{ "role": "user", "parts": [{ "text": "Solve this step by step." }] }],
    "generationConfig": { "thinkingConfig": { "thinkingBudget": 500 } }
  }' | tee test/fixtures/google-thoughts.json
```

### MiniMax
```bash
curl https://api.MiniMax.chat/v1/chat/completions \
  -H "Authorization: Bearer $MiniMax_API_KEY" \
  -H "content-type: application/json" \
  -d '{
    "model": "MiniMax-M3",
    "thinking": { "type": "enabled" },
    "messages": [{ "role": "user", "content": "Solve this step by step." }]
  }' | tee test/fixtures/minimax-thinking.json
```

After replacing any fixture, update its `_meta.synthetic` to `false` and `_meta.validation` to `"captured"`.

## Validation script

A test helper script will verify that every fixture parses as JSON and has the required `_meta` block:

```bash
for f in test/fixtures/*.json; do
  node -e "const m = JSON.parse(require('fs').readFileSync('$f','utf8')); \
           console.log('$f', m._meta && m._meta.provider ? 'OK' : 'MISSING META')"
done
```

Expected: every fixture prints `OK`.