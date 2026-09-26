# mcp-server — `@devdigest/mcp-server`

Local MCP (Model Context Protocol) server exposing 5 tools for reviewing PRs
via the existing DevDigest API. Talks over **stdio** (for local MCP clients
like Claude Desktop/Code) and is a **pure HTTP client** against the
already-running `@devdigest/api` — no direct DB/DI access, no auth needed
(the API's local-dev auth is a no-op single-workspace provider).

## Stack

TypeScript · ESM · `@modelcontextprotocol/sdk` (stdio transport, `McpServer`)
· `zod` (env parsing + tool input schemas). Own `package.json`/lockfile —
this repo has no workspace tooling; see root `AGENTS.md`.

## Run / test

- **The API must already be running** — `../scripts/dev.sh` (or otherwise a
  reachable `@devdigest/api` at `DEVDIGEST_API_URL`). This server fails fast
  at startup with an actionable error if it can't reach the API; it never
  hangs waiting.
- `pnpm dev` — run via `tsx watch` against stdio (for local testing with an
  MCP inspector or a client that spawns this process)
- `pnpm build` / `pnpm start` — compile then run the built server
- `pnpm typecheck`
- `pnpm test` (vitest, hermetic — mocks `ApiClient`/`fetch`, no live API)

## Env vars

| Var | Default | What |
|---|---|---|
| `DEVDIGEST_API_URL` | `http://localhost:3001` | Base URL of the running `@devdigest/api` server |
| `RUN_POLL_INTERVAL_MS` | `1500` | How often `run_agent_on_pr` polls `GET /pulls/:id/runs/active` while waiting |
| `RUN_POLL_TIMEOUT_MS` | `180000` | Max total wait before `run_agent_on_pr` throws a timeout error |

Parsed once, through a zod schema, in `src/config.ts` — nothing else in this
package reads `process.env` directly.

## Map

- `src/config.ts` — the one env chokepoint
- `src/api-types.ts` — hand-copied minimal types/zod schemas for the API
  responses this package reads. **Not** vendored `@devdigest/shared` — this
  package has no build-time coupling to the API's source tree, so it only
  declares the fields the 5 tools actually use. If a contract's shape
  changes upstream (`server/src/vendor/shared/contracts/`), update this file
  by hand.
- `src/api-client.ts` — thin `fetch` wrapper (`listAgents`, `listRepos`,
  `listPulls`, `triggerReview`, `getActiveRuns`, `getReviews`, …) plus the
  startup connectivity check
- `src/resolvers.ts` — `resolveRepo` / `resolvePull` / `resolveAgent`
- `src/shape.ts` — response-shaping helpers (`toAgentSummary`,
  `toFindingSummary`, `toReviewResult`)
- `src/errors.ts` — actionable error helpers, used everywhere so wording
  stays consistent
- `src/poll.ts` — the bounded poll loop `run_agent_on_pr` waits on
- `src/tools/*.ts` — one file per tool: its MCP name/description/input
  schema plus a plain, MCP-SDK-free handler function (kept separate so
  handlers are unit-testable without spinning up the SDK's transport)
- `src/index.ts` — bootstrap: loads config, connectivity check,
  `McpServer` + tool registration, `StdioServerTransport`

## The 5 tools

| Tool | Args | What |
|---|---|---|
| `list_agents` | — | List configured agents (id, name, provider, model, enabled) |
| `run_agent_on_pr` | `repo, pr, agent` | Trigger a review, wait for it, return verdict + findings. The only tool with a side effect. |
| `get_findings` | `repo, pr, agent?` | Return the most recent completed review (any agent, or one specific agent) — no side effect |
| `get_conventions` | `repo` | Return the repo's accepted coding conventions |
| `get_blast_radius` | `repo, pr` | Return the pre-calculated impact map (changed symbols, callers, affected endpoints/cron jobs) for a PR — read-only, may come back `degraded` |

## Cross-cutting conventions (apply to every tool)

1. **Result, not operation.** A tool does its whole job in one call —
   `run_agent_on_pr` creates the run, waits, and returns findings; it never
   exposes start/poll/fetch as separate tools.
2. **Flat arguments.** Every input schema is flat top-level scalars
   (`repo: string`, `pr: number`, `agent: string`) — never nested objects.
3. **Concise structured response.** Tools return only the fields the caller
   needs (via `shape.ts`), never the raw REST payload.
4. **Errors lead the agent forward.** Never a bare "not found" — every error
   (via `errors.ts`) says what to call next (`list_agents`,
   `run_agent_on_pr`, check the repo is imported, etc).

## Non-default conventions

- `api-types.ts` is a **deliberate hand-copy**, not vendored — do not try to
  wire this package up to `@devdigest/shared` or `server/src/vendor/shared`;
  it would couple a pure HTTP client to the API's source tree for no benefit.
- `run_agent_on_pr`'s wait step polls `GET /pulls/:id/runs/active`, not a
  `status` field — a run's presence/absence in that list *is* the "still
  running" signal (see `server/src/modules/reviews/repository/run.repo.ts`
  `activeRunsForPull`, which is already filtered server-side to
  `status='running'`).
- `resolveAgent` tries an exact id match first, then a case-insensitive name
  match; a name matching more than one agent is an error asking the caller
  to use the id, never a silent first-match guess.
- `get_findings` with no `agent` returns the most recent review across all
  agents for that PR — this is not an error case.

## Example Claude Desktop / Claude Code config

```json
{
  "mcpServers": {
    "devdigest": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"],
      "env": {
        "DEVDIGEST_API_URL": "http://localhost:3001"
      }
    }
  }
}
```

Run `pnpm build` first so `dist/index.js` exists, or point `command`/`args`
at `npx tsx /absolute/path/to/mcp-server/src/index.ts` for a no-build setup.
