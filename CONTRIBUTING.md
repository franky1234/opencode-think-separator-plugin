# Contributing

## Workflow

1. Open an issue first describing the change you want to make. Reference the relevant section of [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (architecture & render pipeline) or [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) (opencode version matrix).
2. Fork the repo and create a branch named `feat/<short-name>` or `fix/<short-name>`.
3. Follow TDD: write/update tests in `test/*.test.js` first, then implement.
4. Run `npm run check:fix` (the unified quality gate — see below) — all four gates must pass before opening a PR.
5. Open a PR with a clear description of what changed and why. Reference the issue it closes.

## Quality gate

Before opening a PR, run the unified gate:

```bash
npm run check:fix
```

This single command runs four checks in a fixed order:

| # | Step | Command | What it does |
|---|------|---------|--------------|
| 1 | format | `npm run format` | Prettier rewrites `src/` and `test/` JS to canonical style (writes changes). |
| 2 | lint | `npm run lint` | Biome static-analysis check on `src/` and `test/`. |
| 3 | types | `npm run check:types` | TypeScript `tsc --noEmit` against `types/index.d.ts`. |
| 4 | test | `npm test` | `node --test` over `test/*.test.js`. |

**Why this order matters:** Prettier runs FIRST so its rewrites are already in place before Biome lints. Running Biome on unformatted code can flag style nits as rule violations; running Prettier first ensures Biome sees canonical style and only reports real lint findings. If Prettier made changes, Biome + types + tests already include the new code, so re-running is unnecessary.

**Individual gates** are also available when you want to debug a specific failure:

- `npm run format:check` — Prettier in check-only mode (no writes)
- `npm run lint` — Biome alone
- `npm run check:types` — types alone
- `npm test` — tests alone

The gate order is declared in the `"check:fix"` script in `package.json`; do not reorder it.

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
