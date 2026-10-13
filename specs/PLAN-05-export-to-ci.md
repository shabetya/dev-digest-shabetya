# Plan: Export to CI  |  Plan for SPEC-05 ([SPEC-05-export-to-ci.md](SPEC-05-export-to-ci.md))  |  Status: approved

Defaults approved by the user: multi-agent pipeline (implementer → test-writer →
plan-verifier → architecture-reviewer → doc-writer); `ci_installations` gets a
DB-level unique index on `(agent_id, repo)` in the same AC-16a migration;
`publishDialog.*` i18n is repurposed as the CI tab's "Update CI config"
in-place shortcut, not deleted; `exportWizard.blockMergeTitle`/`blockMergeDesc`
copy is replaced with AC-20's exact wording (it currently says "Requires a
GitHub App — not available with PAT in local mode", which contradicts AC-20
— stale copy from before that design was settled); no synthetic `failed`
`ci_runs` row for a CI run that crashes before uploading an artifact — matches
the spec's own Edge-cases text ("not surfaced as an error").

## Spec follow-ups (now folded into SPEC-05; kept as a record)
1. **`GitHubClient` port gap.** The spec's "already exists, reuse" bucket
   lists `commitFiles`/`createRef`/`openPullRequest`/`findOpenPr`/`postReview`
   but AC-15's Refresh flow needs to list workflow runs and download an
   artifact — neither exists on `GitHubClient` today
   (`server/src/vendor/shared/adapters.ts:143-167`,
   `server/src/adapters/github/octokit.ts`). This is net-new port+adapter
   surface, not reuse — see step 1.
2. **Nullable FK + unique index interaction.** `ci_runs.ci_installation_id`
   is `onDelete: 'set null'`, so a unique index on
   `(ci_installation_id, github_run_id)` alone won't stop a duplicate row
   once an installation is deleted (Postgres treats NULL as distinct per
   row). Step 2/9 must either use `NULLS NOT DISTINCT` (PG15+) or have the
   Refresh upsert additionally key on `github_run_id` alone when
   `ci_installation_id` is null.

## Constraints
- New `server/src/modules/ci/{routes,service,repository,templates}.ts`,
  registered in `server/src/modules/index.ts` next to the other 15 modules;
  routes stay thin (parse → `getContext` → delegate → map), no `drizzle-orm`
  import in `routes.ts` (`onion-architecture`, matches `agents/routes.ts`).
- Neither `ci_installations` nor `ci_runs` has `workspace_id` — every
  repository method must join through `agents` to scope by workspace; no
  `getById(id)` without that join anywhere (onion-architecture "every read by
  id carries the tenant").
- `agent-runner/` is a new top-level package, own `package.json`/lockfile, no
  workspace tooling, consumes `reviewer-core/src` via tsconfig path alias
  exactly like `server/` does — never vendor/reimplement the engine
  (`reviewer-core/AGENTS.md`). Its `dist/` (built via `@vercel/ncc`) is
  committed and never hand-edited (root `CLAUDE.md` do-not-touch).
- `agent-runner` must call the *same* `countBlockers`/`toReviewPayload`
  exported from `reviewer-core/src/index.ts:37-62` that
  `run-executor.ts:325` already uses for local runs — never recompute gate
  logic independently. The server's Refresh-ingestion verdict derivation
  reuses the identical function, a second new call site.
- Workflow YAML generator (`templates.ts`): hardcode
  `permissions: {contents: read, pull-requests: write}`, trigger
  `pull_request` only (never `pull_request_target`), pin
  `actions/checkout@v4`/`actions/upload-artifact@v4` matching
  `.github/workflows/evals.yml`'s own convention, second checkout `ref:`
  baked to this repo's `main` HEAD SHA at export time. Treat repo
  name/agent name/any user-editable Preview content as data that must never
  let a crafted string inject an extra YAML step/permission (`security`
  skill, A05).
- `devdigest-result.json` fetched on Refresh is a cross-trust-boundary
  artifact — validate against `CiResultArtifact` and cross-check
  commit/repo/PR against a tracked `ci_installations` row before writing
  `ci_runs`; never trust a field from it first.
- Vendored contracts: the existing `CiTarget`/`CiFile`/`AgentManifest`/etc.
  need no shape change (already identical in both copies), but the new
  `GitHubClient` artifact/workflow-run methods are a shared-contract change —
  edit `server/src/vendor/shared/adapters.ts` by hand (server-only surface;
  confirm client doesn't need the type before touching its copy).
- Client: no `fetch` in components — `client/src/lib/hooks/ci.ts` (new) on
  top of `client/src/lib/api.ts`; feature components colocated under
  `_components/` of their route, not `src/components/`
  (`client/AGENTS.md`, `frontend-architecture`).
- `client/src/vendor/ui/nav.ts` gets one deliberate `ci-runs` `NavItemDef` —
  a narrow required addition, not a vendor/ restructure.
- Migrations never auto-apply: `pnpm db:generate` → review SQL →
  `cd server && pnpm db:migrate`, explicit step, never skipped.
- DB-backed tests use `*.it.test.ts` or they silently run in the wrong CI
  lane (`server/AGENTS.md`).
- Steps 7/8/9 share `service.ts`/`repository.ts`; step 1 (GitHubClient) must
  land before step 9 (Refresh) can be written or tested; step 3 (agent-runner
  scaffold + path alias proven working) must land before step 4 (its core
  logic) and before step 8 can bake a meaningful pinned-SHA checkout target →
  implement in listed order, not in parallel.

## Steps (dependency order)

| # | Step | Files | AC | Skill |
|---|---|---|---|---|
| 1 | **`GitHubClient` port: workflow-run/artifact reads.** Add `listWorkflowRuns`/`listWorkflowRunArtifacts`/`downloadArtifact` to the interface, `OctokitGitHubClient` impl (`octokit.rest.actions.*`), and a `MockGitHubClient` test double | `server/src/vendor/shared/adapters.ts`, `server/src/adapters/github/octokit.ts`, `server/src/adapters/mocks.ts` | 15,16 | onion-architecture, security |
| 2 | **`ci_runs`/`ci_installations` migration.** Add `commit_sha text`, `github_run_id text` to `ci_runs`; unique index on `(ci_installation_id, github_run_id)` — use `NULLS NOT DISTINCT` or compensate in step 9's upsert for the nullable-FK gap (follow-up 2); add unique index on `ci_installations(agent_id, repo)` per approved default | `server/src/db/schema/ci.ts`, new `server/src/db/migrations/00XX_*.sql` | 16a | drizzle-orm-patterns, postgresql-table-design |
| 3 | **`agent-runner/` package scaffold.** `package.json`, lockfile, `tsconfig.json` with path alias to `../reviewer-core/src` (prove it resolves identically to `server/tsconfig.json`'s), `src/cli.ts` entrypoint | `agent-runner/package.json`, `agent-runner/tsconfig.json`, `agent-runner/src/cli.ts` | 9,11,21 (scaffold) | typescript-expert |
| 4 | **`agent-runner` core logic.** Read PR context from `GITHUB_EVENT_PATH`/env (diff, branch, body, fork detection), call `reviewPullRequest`, `countBlockers` → exit code, build `CiResultArtifact`, post review/comment when `post_as` allows and PR isn't fork-sourced | `agent-runner/src/{run,github-context,result}.ts` | 9,10,11,12,13,14 | security, typescript-expert |
| 5 | **`agent-runner` build.** `@vercel/ncc` bundle, commit `dist/` | `agent-runner/package.json` build script, `agent-runner/dist/` | 21 | — |
| 6 | **`agent-runner` tests.** Hermetic: stubbed `LLMProvider`/GitHub-event fixtures, no network — fork-PR skip, no-secret-in-output, injection-guard framing, exit code on blockers | `agent-runner/src/*.test.ts` | 9,10,11,14 | — |
| 7 | **`CiRepository`.** `upsertInstallation` (one row per agent+repo, relies on step-2 unique index), `getInstallationsForAgent`/`getInstallationById` (always joined through `agents`, never bare), `upsertRunFromArtifact` keyed on `(ciInstallationId, githubRunId)` | `server/src/modules/ci/repository.ts` | 7,15,16,18 | drizzle-orm-patterns, onion-architecture |
| 8 | **`CiService` — export-ci generation.** `exportCi(workspaceId, agentId, input)`; manifest/skill/memory/workflow-YAML templates; reuse `commitFiles`/`findOpenPr`/`openPullRequest` wholesale for Install; static AC-20 hint text | `server/src/modules/ci/{service,templates}.ts` | 1,2,3,4,5,6,7,8,20,21 | zod, security, onion-architecture |
| 9 | **`CiService` — Refresh ingestion.** `refreshRuns(workspaceId, agentId?)` using step-1 methods; validate `CiResultArtifact`, cross-check commit/repo/PR, derive verdict via `countBlockers`; copy `PollingService.pollRepo`'s manual-trigger *shape*, don't call it | `server/src/modules/ci/service.ts` | 15,16 | zod, security |
| 10 | **`ci` module routes.** `POST /agents/:id/export-ci`, `POST /agents/:id/ci/refresh` + `POST /ci-runs/refresh`, `GET /ci-runs`, `GET /agents/:id/ci`; register in `modules/index.ts` | `server/src/modules/ci/routes.ts`, `server/src/modules/index.ts` | 1,2,5,6,7,8,15,16,17,18,20,21 | fastify-best-practices, onion-architecture |
| 11 | **`ciFailOn` reuse — no new wiring.** CI tab's "Fail CI on" calls existing `PUT /agents/:id`; explicit step so no duplicate setting gets built inside `ci` module | none (reuse only) | 19 | — |
| 12 | **Server `ci` module tests.** Unit (mocked `GitHubClient`/db); `*.it.test.ts` integration against real Postgres — tenant-scoping join, re-export upsert idempotency, `(ci_installation_id, github_run_id)` + `(agent_id, repo)` dedupe | `server/src/modules/ci/*.test.ts`, `*.it.test.ts` | 7,15,16,16a | onion-architecture |
| 13 | **`ci-runs` sidebar nav entry.** One `NavItemDef` — `helpers.ts:38`/`shell.json:28` already pre-wire the matcher/label, nothing renders it yet | `client/src/vendor/ui/nav.ts` | — (enables 17) | frontend-architecture |
| 14 | **`/ci-runs` page + data hook.** Thin `page.tsx`, `CiRunsTable` feature component (consumes existing `ci.json` `runs.*` strings), `useCiRuns`/`useRefreshCiRuns` hooks | `client/src/app/ci-runs/page.tsx`, `_components/CiRunsTable/`, `client/src/lib/hooks/ci.ts` | 15,16,17 | next-best-practices, react-best-practices, frontend-architecture |
| 15 | **CI tab on `AgentEditor`.** Add `ci` to `TABS` (`constants.ts:10-17` currently reserves it for later), branch in `AgentEditor.tsx`; `CiTab/` — status badge, installed-repos table, "Add repository"/"Update CI config"/"+Add to CI" entry points | `client/src/app/agents/[id]/_components/AgentEditor/{constants.ts,AgentEditor.tsx}`, new `_components/CiTab/` | 18,19 | react-best-practices, frontend-architecture |
| 16 | **`ExportWizard` feature component.** Wire existing `ExportWizardSteps` (`client/src/vendor/ui/ExportWizardSteps.tsx`) to 4 step bodies: Target (4 cards, 3 disabled "Coming soon"), Preview (read-only files incl. editable workflow YAML), Configure (triggers, post_as, secrets-expected list, AC-20 hint), Install (PR vs zip); `useExportCi` hook; component tests per step | `client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/ExportWizard/` | 1,2,3,4,5,6,7,8,20 | react-best-practices, zod, react-testing-library |
| 17 | **i18n: extend `ci.json`.** Add `exportWizard.secretsExpected` (AC-6); replace `blockMergeTitle`/`blockMergeDesc` with AC-20's exact wording (approved default); repurpose `publishDialog.*` as the CI tab's in-place "Update CI config" shortcut copy (approved default, not deletion) | `client/messages/en/ci.json` | 6,20 | — |
| 18 | **Client component tests.** `CiTab`/`CiRunsTable` — fetch-mocked at the network boundary, 1-3 flow tests per component per `client/AGENTS.md` | `*.test.tsx` colocated | 17,18,19 | react-testing-library |
| 19 | **Root `CLAUDE.md` package-table update** (6th row for `agent-runner/`) — deferred to `doc-writer` stage, not an implementer step | `CLAUDE.md` | — | — |

## AC coverage
AC-1 (16), AC-2 (8,16), AC-3 (8,16), AC-4 (8), AC-5 (8,16), AC-6 (8,16,17),
AC-7 (7,8,12), AC-8 (8,16), AC-9 (3,4,6), AC-10 (4,6), AC-11 (4,6), AC-12 (4),
AC-13 (4), AC-14 (4,6), AC-15 (1,2,9,10,12,14), AC-16 (1,9,12), AC-16a (2),
AC-17 (10,14), AC-18 (7,10,15), AC-19 (11,15), AC-20 (8,17), AC-21 (3,5,8).
All 23 ACs covered; none dropped.

## Test plan
- `agent-runner`: `cd agent-runner && npm test` — fork-skip, no-secret-leak,
  injection framing, exit code on blockers.
- `reviewer-core`: `cd reviewer-core && npm test` — unaffected, run once as a
  baseline check before `agent-runner` starts importing it.
- `server` unit: `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'`
- `server` integration (Docker, confirm not skipped):
  `cd server && pnpm exec vitest run .it.test`
- `server` migration: `cd server && pnpm db:generate && pnpm db:migrate`
  (no drift; applies cleanly)
- `server` typecheck: `cd server && pnpm typecheck`
- `client`: `cd client && pnpm test && pnpm typecheck`
- Manual/E2E (not automatable here, per spec's Worktree-B boundary): a real
  export → PR → GitHub Actions run → Refresh round-trip against a sandbox
  repo is the only way to validate AC-9's fork-PR behavior and AC-21's
  pinned-SHA checkout on real GitHub Actions infrastructure.

## Risks
- Tenant-scoping gap (no `workspace_id` on either CI table) is easy to get
  wrong under time pressure — reviewer should specifically check for a bare
  `getById(id)` on `ci_installations`/`ci_runs`.
- `agent-runner`'s pinned-SHA design means exported workflows don't
  auto-upgrade when `agent-runner`'s source changes later — intentional
  (Resolved clarifications in SPEC-05), but only a real push + re-export can
  fully exercise it; unit/integration tests can't simulate GitHub Actions
  infrastructure.
- Nullable `ci_installation_id` + unique-index interaction (follow-up 2
  above) needs explicit handling in steps 2 and 9, not just assumed away.
- `GitHubClient` port change (step 1) touches a shared adapter interface —
  confirm nothing else implementing `GitHubClient` (if anything beyond
  `OctokitGitHubClient`/`MockGitHubClient`) needs the new methods too.

## Out of scope
Spec non-goals carried through unchanged: CircleCI/Jenkins/Generic CLI
generators, branch-protection configuration, any inbound webhook/public POST
endpoint, a background poll, a real secret-existence check, a
published/marketplace GitHub Action, `conformance_checks`/Plan Verifier,
reworking the local run-executor's write path. Also out of scope for this
plan: writing/editing SPEC-05 itself, architecture/security review (separate
`plan-verifier`/`architecture-reviewer` passes after implementation).
