# Plan: Eval Pipeline  |  Plan for SPEC-04 ([eval-pipeline.md](eval-pipeline.md))  |  Status: implemented

Defaults approved by the user: undecided finding → button disabled; background run + client polling; unlabelled findings neutral in precision; Promote vX in scope; alert 2 pts, window 30 days; scoring in `server/src/modules/eval/scoring.ts`; case attaches to `reviews.agent_id` only.

## Spec follow-ups (now folded into SPEC-04; kept as a record)
1. **Nullable metrics.** `EvalRun`, `EvalDashboard.current/delta`, `EvalTrendPoint` currently use non-null numbers; AC-19..21 need nullable. AC-30 must list these existing shapes as changed.
2. **AC-13 `reason`.** Store as a `reason` column on `eval_suite_runs` (alongside `error`).
3. **Empty `expected_output`** valid only with `must_not_flag`: enforced by Zod `superRefine` on write and read; the "Finding skeleton" for `must_not_flag` yields one item, user may clear to `[]`.
4. **Constants:** `EVAL_CONCURRENCY=3`, `EVAL_CASE_TIMEOUT_MS=120000`, `EVAL_SUITE_STALE_MS=30min`, `EVAL_DIFF_CAP_BYTES=60000`, `EVAL_ALERT_PTS=2`, `EVAL_RUN_ALL_CONFIRM_CASES=30`.
5. **AC-21:** pre-grounding count = `kept + dropped` from the gate; exact only while no `intent` is passed (AC-14 forbids it).
6. **Run on save** = localStorage only. **Run all agents** = client loops `POST /agents/:id/eval-runs`.
7. **Status codes:** new case 201, idempotent duplicate 200, `diff_too_large` 422.
8. **Snapshot reproducibility:** skill ids/names are not enough to reproduce a run. Decide in step 9: resolve skill bodies once at suite start and hold them in memory for the run (preferred), or store bodies in the snapshot.

## Constraints
- Server: routes validate via Zod route schemas, declare `schema.response`, stay thin; errors via `platform/errors.ts` (`finding_undecided`, `no_agent`, `diff_unavailable`, `diff_too_large`, `no_cases`, `different_agents`); `routes.ts` never imports drizzle; every read by id carries `workspaceId`; **no LLM/network call inside `db.transaction()`**; one-running-suite guard via partial unique index (unique violation → 409); `scoring.ts`/helpers pure (no clock, `now` injected); secrets never in snapshots; DB tests named `*.it.test.ts` (use `test/helpers/pg.ts`; they self-skip without Docker); tight rate limit on LLM-spending routes (pattern: `reviews/routes.ts` ~line 174).
- reviewer-core: stays pure, backwards compatible; grounding mandatory.
- **AC-14:** the eval runner must NOT reuse `ReviewRunExecutor.runOneAgent` (pulls repo-intel, callers, rank note, project context, intent). Build `ReviewInput` from frozen case only: `diff`, `prDescription`, `skills`, `systemPrompt`, `model`, `strategy`, `task`. Add a regression test asserting none of those sections appear in the prompt.
- Client: no `fetch` in components (`lib/api.ts` + `lib/hooks/eval.ts`); colocate under route `_components/`; poll with TanStack `refetchInterval` (false on terminal); derive, don't store; components < 200 lines; all strings in `messages/en/*.json`; plain-text rendering only; use `Popover` not `Dropdown` in clipped containers (client INSIGHTS).
- Vendored contracts: **diff both copies first (already drifted)**, edit both by hand identically.
- Migrations not auto-applied: `pnpm db:generate` → review SQL → `pnpm db:migrate`; never hand-edit snapshots.
- Do not touch `agent-runner/dist/`, `clones/`, `.devdigest/cache/`; no root `package.json`.
- Steps 8/9/10 share `service.ts`, 7/10 share `repository.ts`, 1/2 both contract copies → implement **sequentially**.

## Steps (dependency order)

| # | Step | Files | AC | Skill |
|---|---|---|---|---|
| 1 | **Contracts, server copy.** `EvalExpectationType`, `EvalExpectation`; extend `EvalCase`/`EvalCaseInput` (`expectation`, `source_finding_id`, `created_at`, typed `expected_output` + superRefine); add `EvalSuiteRun`, `EvalCaseRun`, `EvalCaseSummary`, `EvalCompare`, dashboard row/workspace shapes; make metric fields nullable | `server/src/vendor/shared/contracts/{knowledge,eval-ci}.ts`, `index.ts` | 1,2,9,19–21,23,25,30 | zod |
| 2 | **Contracts, client copy** mirrored by hand; update `server/test/contracts.test.ts` (valid + invalid expectation arrays, nullable metrics) | `client/src/vendor/shared/contracts/{knowledge,eval-ci}.ts`, `server/test/contracts.test.ts` | 30 | zod |
| 3 | **DB schema.** `eval_cases`: `expectation` (text+CHECK, default `must_find`), `source_finding_id` (FK set null, indexed), `created_at`. New `eval_suite_runs` (AC-2 + `reason`, indexes `(agent_id, ran_at)`, `workspace_id`, **partial unique index on `agent_id` where status='running'**). `eval_runs`: `suite_run_id` (FK cascade, indexed), `error`, case status, pre-grounding count (inside `actual_output` as `{findings, pre_grounding_count}`). Register in tables object | `server/src/db/schema/eval.ts`, `schema.ts`, `rows.ts` | 1,2,3 | drizzle-orm-patterns, postgresql-table-design |
| 4 | **Migration** `0017_*` (additive only; verify CHECK + cascade/set-null; second `db:generate` yields nothing) | `server/src/db/migrations/0017_*`, `meta/*` | 1,2,3 | drizzle-orm-patterns |
| 5 | **Scoring (pure) + constants + unit tests**: `./` normalize, inclusive overlap (swapped tolerated, missing `end_line`=`start_line`), greedy one-to-one by lowest distance with stable tie-break, per-case pass rules, recall/precision/citation aggregators with null rules | `server/src/modules/eval/{scoring,constants}.ts`, `server/test/eval-scoring.test.ts` | 17–22 | typescript-expert |
| 6 | **Pure helpers**: single-file diff snippet (whole intersecting hunks, `diff_too_large` over cap), expectation from accepted/dismissed, slug name, row→DTO, deltas + alert (`now` injected), compare fixed/regressed/only-in-A/B, stale-running detection. Confirm `parseUnifiedDiff` path by grep | `server/src/modules/eval/helpers.ts`, `server/test/eval-helpers.test.ts` | 4,5,6,24,25 | onion-architecture |
| 7 | **Repository** (workspace-scoped): case CRUD + last-run summary, `findCaseBySourceFinding`, suite create w/ guard, append case run, finish suite (single update), `markStaleFailed`, list/get suite runs, dashboard queries (latest per agent, sparkline, recent, 30-day window), compare lookup. No transactions here | `server/src/modules/eval/repository.ts` (+ `platform/container.ts` if shared) | 2,3,9,11,23 | drizzle-orm-patterns |
| 8 | **Service: case creation + CRUD**: `createFromFinding` (`findingContext` workspace check → 404; 409 `finding_undecided`; 422 `no_agent`/`diff_unavailable`/`diff_too_large`; idempotent 200), Zod-validated CRUD, invalid stored rows surfaced as "invalid case" | `server/src/modules/eval/service.ts` | 1,4–7,9 | onion-architecture, security |
| 9 | **Service: suite execution**: `startSuite` (422 `no_cases`, 409 with active id, snapshot config), background loop with concurrency 3 and per-case timeout (check `platform/jobs.ts`/`container.jobs.enqueue`), frozen-input `reviewPullRequest`, fast-fail `llm_unavailable`, per-case error excluded from denominators, aggregates in one update, `runCase` (null `suite_run_id`), read-side stale sweep | `service.ts`, `helpers.ts` | 11–16,21,22 | onion-architecture, typescript-expert |
| 10 | **Service: dashboard/history/compare/promote**: `eval-runs` list, `/eval/dashboard`, per-agent dashboard (delta, trend, alert), compare (422 `different_agents`). Promote = client calls existing `PATCH /agents/:id` with snapshot (verify body can carry skills in `agents/routes.ts`) | `service.ts`, `repository.ts` | 23,24,25,28 | drizzle-orm-patterns |
| 11 | **Routes + registration**: `POST /findings/:id/eval-case`; `GET|POST /agents/:id/eval-cases`; `PATCH|DELETE /eval-cases/:id`; `POST /eval-cases/:id/run`; `POST|GET /agents/:id/eval-runs`; `GET /eval-suite-runs/:id`; `GET /eval-suite-runs/compare` (**register before `:id`**, test it); `GET /eval/dashboard`; `GET /agents/:id/eval-dashboard`; rate limits on the two LLM routes; register in `modules/index.ts` | `server/src/modules/eval/routes.ts`, `modules/index.ts` | 4,6,7,9,11,15,16,23,25 | fastify-best-practices |
| 12 | **reviewer-core (optional)**: add `preGroundingCount` to `ReviewOutcome`, export, hermetic test; else use `findings.length + dropped.length` | `reviewer-core/src/review/run.ts`, `src/index.ts`, tests | 21 | onion-architecture |
| 13 | **Server integration tests** `eval-create-case`, `eval-suite`, `eval-dashboard-compare` (`*.it.test.ts`): accepted/dismissed/undecided/duplicate/cross-workspace/`no_agent`/`diff_unavailable`/cascades; suite success/per-case error/no-key/409/`no_cases`/stale/single-case; delta, alert, compare, `different_agents`; AC-14 prompt-content assertion | `server/test/eval-*.it.test.ts` | 3–9,11–16,23–25 | fastify-best-practices |
| 14 | **Client api + hooks** (`useTurnIntoEvalCase`, cases CRUD, `useRunCase`, `useStartSuite`, `useSuiteRun` polling, dashboards, compare, promote) | `client/src/lib/{api.ts,hooks/eval.ts,hooks/index.ts}` | 8,16,26–28 | frontend-architecture, react-best-practices |
| 15 | **FindingCard "Turn into eval case"**: colocated `_components/EvalCaseButton/`; disabled + tooltip when undecided; success "Case created" + link `/agents/<owner_id>?tab=evals`; reason-specific errors; verify both render sites (`FindingsPanel`, `RunTraceDrawer/.../FindingsSection`, `DiffTab`); tests | `.../pulls/[number]/_components/FindingCard/*`, `client/messages/en/prReview.json` | 4,6,8,29 | react-best-practices, react-testing-library |
| 16 | **Evals tab + case editor modal**: add `evals` to `TABS` + branch in `AgentEditor.tsx`; `_components/EvalsTab/` (tiles with deltas, N/M passing, Run all, rows, `never run`, "edited since last run"); modal (Diff/Files/PR meta tabs, JSON editor with validity, Finding skeleton, Run case, Save, Run on save in localStorage); `useReducer`; strings; tests | `client/src/app/agents/[id]/_components/AgentEditor/{constants.ts,AgentEditor.tsx,_components/EvalsTab/*}`, `messages/en/{agents,eval}.json` | 10,15,26,29,31 | react-best-practices, frontend-architecture, react-testing-library |
| 17 | **Sidebar + Eval pages**: one deliberate line in `client/src/vendor/ui/nav.ts` (SKILLS LAB, `eval`; `nav.eval` string and `activeKeyFor` already exist; check tests asserting NAV length); `/eval` (Run all agents w/ confirm, rows + sparkline, recent table) and `/eval/[agentId]` (back link, switcher, 30-day window, Run eval, alert banner, tiles, trend chart, runs table max 2 checkboxes, Compare); `CompareRunsModal` (deltas with icon+text, prompt diff with +/− gutter, fixed/regressed, Promote w/ confirm); tests | `client/src/vendor/ui/nav.ts`, `client/src/app/eval/**`, `messages/en/eval.json` | 23,24,26–29,31 | next-best-practices, frontend-architecture, react-best-practices |
| 18 | **Sensitivity experiment doc**: run good vs previous vs degraded prompt on a real model, record metrics in `docs/eval-pipeline.md`, add row to root CLAUDE.md docs table (via `doc-writer`) | `docs/eval-pipeline.md` | spec goal | — |

## AC coverage
All AC-1…AC-31 are covered; mapping is in the table above (AC-14 is enforced by step 9 + the step 13 prompt-content test; AC-22 also by step 18).

## Test plan
- server unit: `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'`
- server integration (Docker required; confirm tests actually ran, not skipped): `cd server && pnpm exec vitest run .it.test`
- server types: `cd server && pnpm typecheck`
- migration: `cd server && pnpm db:generate && pnpm db:migrate` (no drift; applies on a DB at 0016)
- reviewer-core (if step 12): `cd reviewer-core && pnpm test && pnpm typecheck`
- client: `cd client && pnpm test && pnpm typecheck`, plus one `pnpm build` (async params / Suspense)
- e2e: follow-up (out of scope)

## Risks
- Nullable metrics may break existing contract consumers — client typecheck is the net.
- Vendored contract drift: one-sided edits break the other package.
- Reusing `runOneAgent` would silently violate AC-14.
- `kept + dropped` wrong if `intent` is ever passed (hence optional step 12).
- Concurrent Run-all race → partial unique index, treat violation as 409.
- Server restart mid-run leaves `running` rows → read-side stale sweep (30 min); queued cases are not resumed.
- LLM spend: concurrency 3, rate limit, confirm threshold.
- Run must use `config_snapshot` only, never re-read the agent per case.
- `must_not_flag` can penalise a later correct finding on the same lines (document in editor copy).
- Route order `compare` vs `:id`; `vendor/ui/nav.ts` is canonical-copy territory (isolate the change); stale local DB volume can shadow seeds — test on a fresh DB.
- Not read by the planner (confirm first): `adapters/git/diff-parser.ts`, `platform/jobs.ts`, `modules/agents/routes.ts`, reviewer-core test layout, `FindingsSection`/`RunHistory` wiring.

## Out of scope
Spec non-goals (LLM judge, skill evals, CI/auto-runs, `evals/` import, multi-sample stats, case versioning, e2e), architecture/security review (separate agents afterwards), moving scoring into reviewer-core.
