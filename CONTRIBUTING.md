# Contributing

## Workflow

1. Open an issue first describing the change you want to make. Reference the relevant part of [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and the plan at [docs/superpowers/plans/think-separator-0.1.0.md](docs/superpowers/plans/think-separator-0.1.0.md).
2. Fork the repo and create a branch named `feat/<short-name>` or `fix/<short-name>`.
3. Follow TDD: write/update tests in `test/*.test.js` first, then implement.
4. Run `npm test` — all tests must pass before opening a PR.
5. Run `node --check src/<file>.js` on every modified file as a final sanity check.
6. Open a PR with a clear description of what changed and why. Reference the issue it closes.

## Code style

- **ESM only** (`"type": "module"` in `package.json`).
- **No runtime dependencies.** Dev dependencies are tolerated but discouraged.
- **No comments that explain "what"** — only "why". Public APIs get JSDoc blocks.
- **Single responsibility per function**, small files.
- **Follow existing patterns** in `src/detect-reasoning.js`, `src/render.js`, `src/config.js`. Read them before adding new modules.

## Adding a new reasoning field

If a new provider starts emitting reasoning under a field name not in [src/detect-reasoning.js](src/detect-reasoning.js):

1. Add the field to the `REASONING_FIELDS` array (keep alphabetical order).
2. Add a synthetic fixture in `test/fixtures/<provider>-<field>.json` with `_meta.synthetic: true, validation: "pending"`.
3. Add a test case in `test/detect-reasoning.test.js`.
4. Run `npm test` to confirm the new test passes.
5. Open a PR.

## Replacing synthetic fixtures with real captures

This is a **required step before v1.0.0**. See [test/fixtures/README.md](test/fixtures/README.md) for curl invocations per provider. After capturing a real response:

1. Save the raw response body (no headers, no auth fields) to `test/fixtures/<name>.json`.
2. Update `_meta.synthetic` to `false` and `_meta.validation` to `"captured"`.
3. Add the capture date to `_meta.captured_at` (ISO 8601).
4. Run `npm test` to confirm detection still works on the real shape.
5. Open a PR.

## Reporting issues

Use GitHub Issues. Include:
- opencode version (`opencode --version`)
- Provider and model you were using
- A minimal reproduction (the prompt + what you expected vs what you saw)
- If you captured a real response that the plugin mis-handles, attach it as a fixture candidate

## Communication

GitHub Issues and Pull Requests only. No chat support channels in v0.1.0 — too small a project to maintain them.