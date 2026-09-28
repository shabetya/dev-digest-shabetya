# DevDigest

Local-first AI PR review tool. Course starter: import a PR, run an agent
review, see grounded findings. Full picture (architecture diagram, what works,
course roadmap): [README.md](README.md). Test strategy: [TESTING.md](TESTING.md).

## Stack

Node ≥ 22 · pnpm ≥ 10 · TypeScript · Docker (Postgres + pgvector, dev-only)

## Packages (no workspace — each has its own package.json/lockfile)

| Folder | Package | What | Map |
|---|---|---|---|
| `server/` | `@devdigest/api` | Fastify 5 + Drizzle/Postgres API | [server/AGENTS.md](server/AGENTS.md) |
| `client/` | `@devdigest/web` | Next.js 15 studio UI | [client/AGENTS.md](client/AGENTS.md) |
| `reviewer-core/` | `@devdigest/reviewer-core` | diff → prompt → LLM → findings engine | [reviewer-core/AGENTS.md](reviewer-core/AGENTS.md) |
| `e2e/` | `@devdigest/e2e` | deterministic browser e2e (agent-browser) | [e2e/AGENTS.md](e2e/AGENTS.md) |
| `mcp-server/` | `@devdigest/mcp-server` | local MCP server (stdio) exposing PR-review tools over the API | [mcp-server/AGENTS.md](mcp-server/AGENTS.md) |

Cross-package code goes through tsconfig path aliases, not published
packages — e.g. `server` imports `reviewer-core/src` directly.

## Run / test

- Full stack: `./scripts/dev.sh` (Postgres via Docker + API `:3001` + web `:3000`)
- E2E: `./scripts/e2e.sh` (isolated stack, alt ports — never touches your dev DB)
- Per package: `pnpm test` / `pnpm typecheck` inside `server/`, `client/`,
  `reviewer-core/`; `npm test` inside `e2e/` (its own lockfile, not pnpm)

## Non-default conventions

- No monorepo/workspace tooling — packages are independent; don't add a root
  `package.json` or try to hoist deps.
- Shared Zod contracts (`@devdigest/shared`) are **vendored, not symlinked**,
  into `server/src/vendor/shared` and `client/src/vendor/shared` — the two
  copies can drift and currently do. When you change a shared contract, edit
  both by hand.
- Secrets (LLM / GitHub keys) live in `~/.devdigest/secrets.json` (mode
  `0600`), not `.env` — `.env` is only a fallback. Never commit keys.
- DB migrations are **not** applied on server boot — always
  `cd server && pnpm db:migrate` after pulling schema changes.

## Gotchas

- `docker compose down -v` deletes the Postgres volume (`devdigest_pgdata`) —
  wipes every imported repo/review. Use `docker compose down` (no `-v`) to
  just stop it.
- `REPO_INTEL_ENABLED` (default `true`) and `EMBEDDINGS_ENABLED` (default
  `false`) gate what the reviewer prompt sees / what calls OpenAI — check both
  before assuming a feature is broken vs. just off.
- `server/src/modules/` already has every course-lesson table/module slot
  scaffolded; most are unused in the starter — an empty-looking module isn't
  necessarily dead code.

## Do-not-touch

- `agent-runner/dist/` (when present) is a committed build output for a
  GitHub Action — never gitignore or hand-edit it; it must match its source.
- `clones/` (git-ignored repo checkouts) and `.devdigest/cache/` are runtime
  state, never source.

## Deeper docs — use when

| File | Use when |
|---|---|
| [README.md](README.md) | you need the full architecture diagram or course roadmap — not for a quick "where does X live" lookup |
| [TESTING.md](TESTING.md) | deciding which suite an untested change needs, or debugging why a CI workflow didn't run |
| [docs/agent-prompts/](docs/agent-prompts/README.md) | authoring/editing a built-in reviewer agent's system prompt, or picking its default model |
| [docs/smart-diff.md](docs/smart-diff.md) | working on the Smart Diff file-grouping/inline-findings feature (spans `server/` + `client/`), or the `classifyFile` role rules |
| a package's own `AGENTS.md` (linked in the table above) | you're about to touch files inside that package |
| a package's `docs/` / `specs/` / `INSIGHTS.md` | see that package's own `AGENTS.md` — same "use when" pattern, one level down |
