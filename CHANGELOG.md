# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] - 2026-10-13

### Added

- OpenCode **V2** plugin loader support: the default export now carries a
  `setup(ctx)` adapter alongside the existing V1 `server` factory. The adapter
  reuses the V1 hook factory and translates each hook onto the V2
  `ctx.session.hook` registration API (mirroring `engram.ts#setupEngramV2`):
  - `experimental.chat.messages.transform` → `session.hook("context")`
  - `experimental.session.compacting` → `session.hook("compaction")`
- The V1 `{ id, server }` export shape is unchanged (additive only), so hosts
  that only know V1 keep working.

### Fixed

- The plugin no longer fails opencode V2's module validation
  (`Plugin must export a default definition with an id and an effect or setup
  function`). This is what made `opencode plugin list` render an empty ID
  column for `opencode-think-separator-plugin` on opencode v2.0.28.

## [0.5.0] - 2026-09-25

- Added the `markdown-rendered` render style and per-model config resolution.
