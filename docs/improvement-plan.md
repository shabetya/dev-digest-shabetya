# Cross-Package Improvement Plan

**Compiled:** 2026-09-17 · **Scope:** all four packages (`client/`, `server/`,
`reviewer-core/`, `e2e/`) · **Method:** three parallel audits, each applying
the repo's own skills — `frontend-architecture` + `react-best-practices` +
`next-best-practices` for `client/`; `fastify-best-practices` +
`drizzle-orm-patterns` + `postgresql-table-design` + `zod` + `security` +
`typescript-expert` (plus general layering judgment — there is no dedicated
backend-architecture skill yet) for `server/`; `typescript-expert` + `zod` +
`security` for `reviewer-core/` and `e2e/` — grounded in the actual source
tree, not generic advice. Every finding below cites a real file.

## How to read this

Findings are grouped by **cross-cutting theme first**, because the most
interesting result of running four packages through this lens is that the
same three or four mistakes recur in different clothing across the stack.
Fixing a theme once (e.g. "who owns atomicity/boundary enforcement") pays off
in more than one package. A full per-package findings appendix follows for
anyone working inside a single package.

---

## Cross-cutting themes

### Theme 1 — "Thin orchestration layer" isn't enforced anywhere it should be

The same architectural rule — the outermost layer (Fastify route / Next.js
page) should orchestrate, not implement — is violated in both `server/` and
`client/`, for the same underlying reason: nothing stops business logic from
accreting in the layer closest to the framework, because there's no
mechanical check (lint rule, module boundary) forcing it out.

- **`server/src/modules/{pulls,polling,settings,workspace}/routes.ts`** skip
  the `service.ts`/`repository.ts` split the rest of the modules use.
  `pulls/routes.ts` is 357 lines of GitHub sync, diff-stat backfill, and
  score aggregation directly in route handlers with 6+ inline DB round-trips.
- **`client/src/app/repos/[repoId]/pulls/[number]/page.tsx`** (185 lines)
  calls 8 hooks directly and owns derived-findings computation, breadcrumb
  building, and hand-rolled query-param tab state — the same shape of
  problem, one layer down the stack.

Both audits independently flagged this as their **#1 or #3 priority fix**,
and both point at the same fix: extract the logic into the layer the
repo already uses successfully elsewhere (`agents`/`repos`/`reviews`
modules on the backend; `_components/` containers on the frontend), rather
than inventing a new pattern.

### Theme 2 — Nobody owns atomicity/consistency at write boundaries

- **`server/`**: zero `db.transaction()` calls anywhere in the codebase.
  Two concrete correctness risks: agent create/update writes `agents` then
  `agent_versions` as separate statements (a crash mid-way breaks the
  versioning feature `agent_versions` exists for), and `deleteAgentRun`
  deletes `reviews` then `agentRuns` separately specifically *because*
  `reviews.runId`/`reviews.agentId` have no FK — the DB isn't enforcing what
  app code is hand-rolling.
- **`reviewer-core/`**: the `Finding` schema's lethal-trifecta fields
  (`trifecta_components`/`evidence`) are `.nullish()` with a comment saying
  they're only present for one `kind` value — exactly the case for
  `z.discriminatedUnion('kind', [...])`, but it isn't one. Same shape of
  problem as the missing FKs: an invariant that's documented in a comment
  instead of enforced by the type/schema system.

One theme, two layers: **the schema/DB layer isn't enforcing invariants that
app code currently maintains by convention and vigilance alone.**

### Theme 3 — Consistency drift within otherwise-good patterns

Neither package has a *wrong* pattern — both have a *right* pattern that
isn't applied everywhere:

- **`client/`**: `@/*` import alias exists and is mostly used, but 19+ files
  bypass it with deep relative imports (worst case: 7 levels of `../../..`),
  sometimes mixing both styles in the same file. Similarly, most
  `_components/` folders extract a `styles.ts`, but three components
  (`ReviewRunAccordion`, `RunHistory`, `AddRepoView`) don't, with inline
  style blocks and magic numbers instead.
- **`server/`**: response-schema allowlisting (`schema.response`) is used
  nowhere, and one route (`reviews/routes.ts`) hand-rolls `.parse()` instead
  of declaring `schema.body` like every other route does.
- **`reviewer-core/`**: a stray `pnpm-lock.yaml` + `pnpm-workspace.yaml` sit
  next to the documented `package-lock.json` — exactly the "no workspace
  tooling in a leaf package" pattern the root `CLAUDE.md` warns against,
  apparently from a one-off `pnpm install`.

These are all cheap, mechanical fixes (codemod + a lint rule, in most cases)
that prevent the drift from compounding further.

### Theme 4 — LLM-generated content is validated for *location*, never *content*

`reviewer-core`'s grounding gate (`grounding.ts`) rigorously checks that a
finding's file/line actually exists in the diff — "never trust the model" on
the geometry. But `output/to-review.ts` interpolates a finding's
`title`/`rationale`/`suggestion` text straight into markdown that becomes a
real GitHub review body/comment, with no escaping. Since that same
model-generated text is influenced by whatever's in the diff/PR description
(the exact surface `prompt.ts`'s `INJECTION_GUARD` defends the *prompt*
against), the *output* side of the same threat model has no equivalent
guard. This is the one finding across all three audits with a plausible
security angle beyond "will bite you eventually" — flagged as a priority
below.

---

## Prioritized roadmap

### P0 — correctness & security, worth doing before the next feature lands

| # | Package | Fix | Why now |
|---|---|---|---|
| 1 | `server/` | Wrap `agents/repository.ts` `insert`/`update` (agent row + `agent_versions` snapshot) in `db.transaction()` | Partial failure silently breaks the reproducibility feature the versions table exists for |
| 2 | `server/` | Wrap `deleteAgentRun`'s two deletes in a transaction **and** add the missing FKs on `reviews.runId`/`reviews.agentId` (`SET NULL`/`CASCADE`) | App code currently hand-rolls a cascade the DB should enforce; currently the one path that can orphan a row |
| 3 | `reviewer-core/` | Escape/sanitize `title`/`rationale`/`suggestion` before markdown interpolation in `output/to-review.ts` (`composeBody`, `inlineComments`) | The only unguarded spot where injection-influenced model text reaches a real output surface (GitHub + the client renderer) |

### P1 — architectural consistency, do within the next couple of sprints

| # | Package | Fix | Why |
|---|---|---|---|
| 4 | `server/` | Split `pulls/routes.ts` (357 lines) into `service.ts`/`repository.ts`; same for `polling`, `settings`, `workspace` | Largest layering inconsistency found; highest regression risk, zero unit-testable seams today |
| 5 | `client/` | Extract `pulls/[number]/page.tsx`'s tab/trace state + derived findings into a container/hook | Mirror of #4 one layer up; the app's most complex route |
| 6 | `server/` | Add indexes on `reviews.{prId,workspaceId,runId}`, `findings.reviewId`, `agentRuns.{prId,agentId,workspaceId}` | Already-queried columns with no supporting index, unlike `repos`/`pullRequests` which do this correctly today |
| 7 | `server/` | Constrain `findings.{severity,category,kind}`/`reviews.verdict`/`agentRuns.status` as Postgres enums or `CHECK`s, matching the zod contract's closed unions; stop the `as Finding['severity']` unchecked casts in `reviews/helpers.ts` | `severity` gates CI-blocking logic — a corrupted/legacy value would silently bypass it |
| 8 | shared contract | Model the lethal-trifecta `Finding` variant as `z.discriminatedUnion('kind', [...])` in `server/src/vendor/shared/contracts/findings.ts` (**remember to hand-sync into `client/src/vendor/shared`** per the repo's documented drift convention) | Closes the same "invariant lives in a comment, not the schema" gap as #2, on the shared contract every package trusts |
| 9 | `reviewer-core/` | Remove `test/run.test.ts`'s import of `server/src/adapters/mocks.js`; give reviewer-core its own local test fixtures | Inverts the package's own documented dependency direction; reviewer-core's tests currently can't run without `server/src` present |

### P2 — polish & drift prevention, cheap and mechanical

| # | Package | Fix |
|---|---|---|
| 10 | `client/` | Codemod deep relative imports (19+ files) to the `@/` alias; add an eslint rule (`import/no-relative-parent-imports` or similar) to lock it in |
| 11 | `client/` | Replace `ConfigTab`'s reset-via-`useEffect` (9 `useState`s + a disabled exhaustive-deps lint rule) with `key={agent.id}` on the call site; consider `useReducer` for the 9 co-dependent fields |
| 12 | `client/` | Move `pulls/page.tsx`'s inline filter/search/sort pipeline into the already-existing sibling `pulls/helpers.ts` |
| 13 | `client/` | Standardize on `styles.ts` for `ReviewRunAccordion`, `RunHistory`, `AddRepoView` (or explicitly document an inline-style exception) |
| 14 | `server/` | Route `reviews/routes.ts`'s `RunRequest` through `schema: { body: RunRequest }` instead of hand-rolled `.parse()`; add `schema.response` starting with `agents`/`reviews` (DTOs already exist) |
| 15 | `reviewer-core/` | Delete the stray `pnpm-lock.yaml`/`pnpm-workspace.yaml`; keep `package-lock.json` + `npm` as documented |
| 16 | `reviewer-core/` | Add direct unit tests for `grounding.ts` (`buildLineIndex`/`rangeIntersects`) and `llm/structured.ts` (`extractJson`/`parseWithRepair`) — currently only exercised indirectly |
| 17 | `e2e/` | Rewrite `e2e/specs/README.md` — it currently carries the generic "in-flight design doc, delete once shipped" template text, which could mislead a contributor into deleting a live, CI-run flow spec |

---

## What's already working well (don't disturb these while fixing the above)

- **Secrets discipline** (`server/`): `SecretsProvider`/`LocalSecretsProvider`
  is consistently the only path to API keys; `AppConfig` deliberately excludes
  them. Verified holding across every adapter/service inspected.
- **DTO boundary discipline** (`server/`): `agents`, `repos`, `reviews`
  modules all convert Drizzle rows to plain DTOs in `helpers.ts` before
  returning — no raw row type reaches a route's return value in the layered
  modules (the exact pattern the unlayered modules in Theme 1 should adopt).
- **Zod-as-source-of-truth** (`server/` + `reviewer-core/`): contracts
  consistently pair `z.object` with `z.infer`, and structured LLM output is
  parsed with `safeParse` + a repair-reprompt loop, never a throwing `parse`.
- **The API layer** (`client/`): `src/lib/api.ts` + `src/lib/hooks/*` is a
  clean, textbook instance of the "External HTTP API" strategy — one typed
  client, one hook per resource, zero raw `fetch()` calls outside it,
  verified by repo-wide grep.
- **Prompt-injection defense on the input side** (`reviewer-core/`): a single
  shared `INJECTION_GUARD` + `wrapUntrusted()` delimiter-fencing, pinned by a
  dedicated test — this is what makes Theme 4's gap on the *output* side
  worth closing to match.
- **e2e determinism** (`e2e/`): no AI/`chat` locator usage, no sleep-based
  waits, `execFile` (not shell `exec`) for the `agent-browser` subprocess —
  the documented guarantees hold up across all 7 flow specs.

---

## Appendix: full per-package findings

The three source audits (with every finding, file:line reference, and
severity) are preserved in this session's transcript. If you want them as
standalone reference docs (e.g. `server/specs/`, `client/specs/`,
`reviewer-core/specs/`) rather than condensed into this cross-package plan,
say so and I'll write each one out in full — right now this file keeps only
what's needed to act, to stay inside the "specs are for planning, don't let
them go stale" convention this repo already follows.
