# e2e — `@devdigest/e2e`

Deterministic browser e2e for the web app, driven by Vercel `agent-browser`
(native CLI — no Playwright, no LLM, no API key). Full picture (flow format,
coverage table): [README.md](README.md).

## Stack

`agent-browser` CLI (install once globally: `npm i -g agent-browser &&
agent-browser install`) + `run.ts` (tsx). Own `package.json`/lockfile — npm,
not pnpm, unlike the other packages.

## Run / test

- Hermetic (recommended): `./scripts/e2e.sh` from repo root, or
  `npm run e2e:hermetic` — isolated Postgres/API/web on alt ports
  (`:5433`/`:3101`/`:3100`), torn down after
- Against your own running dev stack: `npm test` — **only safe if your dev DB
  has just the seeded demo repo**, see gotcha below
- `npm run typecheck`

## Map

- `specs/NN-name.flow.json` — one flow = ordered list of `agent-browser`
  commands (format: [README.md § How a flow works](README.md#how-a-flow-works))
- `run.ts` — executes flows in order against one shared browser session
- `lib/` — flow-runner helpers

## Non-default conventions

- Locators are deterministic only (`--url`, `--text`, `find
  role|text|label`) — the AI `chat` command is never used, so runs stay
  stable and key-free.
- Assertions are the `wait --text` / `wait --url` steps themselves (they
  exit non-zero on timeout); `assert.stdoutIncludes` is the only extra check
  available.

## Gotchas

- Flows assume the seeded demo repo (`acme/payments-api`, PR #482) is the
  **only** repo in the DB — running `npm test` against a dev DB with other
  imported repos breaks flows 02/04/05. Use the hermetic runner instead.
- **Never `docker compose down -v`** to reset for e2e — it deletes the
  `devdigest_pgdata` volume and every real repo/review you've imported. The
  hermetic runner uses its own ephemeral Postgres instead.
- Failure screenshots land in `test-results/` (git-ignored).

## Deeper docs — use when

| File | Use when |
|---|---|
| [README.md](README.md) | you need the full flow-format spec or coverage table — not for routine edits |
| [docs/](docs/) | investigating a past design decision or internal flow not covered above |
| [specs/](specs/) | planning or reviewing an in-flight feature for this package |
| [INSIGHTS.md](INSIGHTS.md) | you hit a surprising bug or behavior here — check whether it's already explained, or use the `engineering-insights` skill to append a new one |
