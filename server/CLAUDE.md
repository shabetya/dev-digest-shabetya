# server — `@devdigest/api`

Fastify 5 + Drizzle/Postgres API: imports repos/PRs, indexes with
repo-intel, runs `reviewer-core` reviews. Full picture (DI flow, API map,
review-context internals): [README.md](README.md).

## Stack

Fastify 5 · Drizzle ORM · `postgres` + pgvector · Zod via
`fastify-type-provider-zod` (one schema drives request validation *and*
response serialization) · DI container over adapters (LLM / GitHub / git /
ast-grep / secrets)

## Run / test

- `pnpm dev` (`:3001`) · `pnpm build` · `pnpm typecheck`
- `pnpm db:migrate` · `pnpm db:seed` (idempotent demo data)
- `pnpm test` = unit + integration. Unit only:
  `pnpm exec vitest run --exclude '**/*.it.test.ts'`. Integration only (real
  Postgres via testcontainers): `pnpm exec vitest run .it.test`

## Map

- `src/modules/<name>/` — one feature module per domain (routes + service),
  registered in `src/modules/index.ts`. See the table in
  [README.md § API map](README.md#api-map-starter).
- `src/adapters/` — ports to the outside world (LLM, GitHub, git, secrets);
  `mocks.ts` swaps them in for tests.
- `src/platform/` — DI container, config loading.
- `src/db/` — Drizzle schema + migrations.
- `src/vendor/shared` — vendored copy of `@devdigest/shared` (see root
  [CLAUDE.md](../CLAUDE.md) re: drift vs. `client/`).

## Non-default conventions

- Routes validate via Zod `params`/`body` schemas declared on the route, not
  hand-rolled `Schema.parse()` in handlers — invalid input 422s before the
  handler runs.
- A DB-backed test (imports `test/helpers/pg.ts`) **must** use the
  `*.it.test.ts` filename suffix — the unit/integration split in CI depends
  on it.
- Secrets never go through `AppConfig`/`.env` — always through
  `SecretsProvider` (`~/.devdigest/secrets.json`).

## Gotchas

- No keys required to boot: every secret is optional in `loadConfig`; a
  missing key degrades a feature, it doesn't crash startup.
- `REPO_INTEL_ENABLED=false` doesn't disable repo-intel outright — it drops
  the repo skeleton / blast-radius note from the prompt and falls back to
  ripgrep-only.
- Rate limiting (120/min global) is disabled under `NODE_ENV=test` — don't
  rely on it in tests.

## Do-not-touch

- `clones/` — git-ignored checkouts of imported repos; runtime state, not
  source.

## Deeper docs — use when

| File | Use when |
|---|---|
| [README.md](README.md) | you need the DI-flow diagram, the full API map, or the review-context deep dive — not for routine edits |
| [docs/](docs/) | investigating a past design decision or internal flow not covered above |
| [specs/](specs/) | planning or reviewing an in-flight feature for this package |
| [INSIGHTS.md](INSIGHTS.md) | you hit a surprising bug or behavior here — check whether it's already explained |
