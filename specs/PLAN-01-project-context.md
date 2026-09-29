# PLAN-01 — Project Context (Development Plan)

Implements [SPEC-01-project-context.md](SPEC-01-project-context.md). Produced by `implementation-planner`.
Status: **open questions resolved (see bottom); ready to implement once execution mode is chosen.**

## Affected packages

- `reviewer-core/src/{prompt.ts,review/run.ts,index.ts}` — context block, guard wording, specs passthrough
- `server/src/vendor/shared/*` and `client/src/vendor/shared/*` — contracts (hand-mirrored; already drifted, diff first)
- `server/src/adapters/git/simple-git.ts`, `server/src/adapters/mocks.ts` — list/read markdown, path guard
- `server/src/db/schema/{agents,skills}.ts`, `schema.ts`, migration `0016_*` — join tables
- new `server/src/modules/context/`; `modules/agents`, `modules/skills`; `platform/container.ts`
- `server/src/modules/reviews/run-executor.ts`, `platform/trace-builder.ts`
- `client/src/lib/hooks/`, new `client/src/app/repos/[repoId]/context/`, AgentEditor/SkillEditor Context tab, `RunTraceDrawer/.../TraceBody.tsx`, `client/messages/en/{context,runs}.json`
- Not touched: `agent-runner/dist/`, `clones/`, `.devdigest/cache/`, root `package.json`

## Constraints

- Shared contracts: edit both vendored copies by hand.
- Migrations are not applied on boot → `cd server && pnpm db:migrate`.
- Routes: Zod params/body/response; routes → service → repository; no drizzle in routes; use `getContext`; errors from `platform/errors.ts`.
- reviewer-core stays pure (no fs/DB); omitted optional slots leave no placeholder.
- DB tests are `*.it.test.ts`. New port method = interface + impl + mock + wiring.
- Client: no `fetch` in components; hooks in `src/lib/hooks/*`; thin `page.tsx`; `react-markdown` with raw HTML off.
- `server/src/db/schema/context.ts` holds unrelated code-index tables — leave alone.

## Steps

1. **Done:** open questions resolved and SPEC-01 updated by hand (see Resolved decisions). AC: all.
2. **Contracts.** Diff both `platform.ts`/`trace.ts` copies. Extend `SpecFile` (tokens, group, used_by_agents, optional reason); add list envelope `{files, truncated, reason?}`, preview `{path, content}`, attach body `{paths}` schemas (no effective-list schema — client-computed); add nullish `project_context_detail` to trace; remove `IndexStatus`. Server first, mirror to client, update `client/src/lib/types.ts`. AC-1, 3, 7, 8, 9, 18, 22. Skill: zod.
3. **Git port.** `listMarkdown`, path guard (reject `..`, absolute, non-`.md`, duplicates; attach cap 50), realpath containment, excluded dirs and caps constants; impl in `SimpleGitClient` + mock; new guarded read (do not change existing `readFile`). AC-1, 5, 6, 16. Skills: onion-architecture, security.
4. **DB.** `agent_context_docs`, `skill_context_docs` (PK owner+path, order, FK cascade, FK index); register in `schema.ts`; generate `0016` + journal + snapshot; migrate. AC-7, 8, 12. Skills: drizzle-orm-patterns, postgresql-table-design.
5. **`modules/context`.** Repository (attachments, used-by counts, effective list via linked skills + `enabled`), service (tokens via `container.tokenizer.count`, preview, group, caps), routes (`GET /repos/:id/context`, `GET /repos/:id/context/preview?path=`; no doc write), constants/helpers; wire container + `modules/index.ts`. AC-1–6, 10, 11. Skills: fastify-best-practices, onion-architecture, zod.
6. **Attach endpoints** `PUT /agents/:id/context`, `PUT /skills/:id/context` (body `{paths}`, returns ordered paths; replace full ordered list in a transaction; 422 on invalid paths; skill `used_by`). AC-5, 7, 8, 11–13. Serialize with step 5 (shared container/repositories).
7. **reviewer-core.** `## Project context` block, untrusted notice, notice line, each server-preformatted entry (`### <sanitised path>` + content) wrapped via `wrapUntrusted` with the fixed `spec-${i}` label; `specs` stays `string[]`; extend `INJECTION_GUARD` (CI wording change accepted); unit tests. Server sanitises the path in step 8. AC-15, 16b, 17. Skills: typescript-expert, security.
8. **run-executor.** Effective list (own docs, then enabled linked skills in link order, dedupe by path); verify the run path syncs the clone first (add a sync call if not); guarded read, entries pre-formatted as `### <sanitised path>` + content; skips: `too_large` >200 KB, `empty`, `budget_exceeded` >30k tokens, read failure, missing clone; log via `runLog.info`; pass specs; write `specs_read` + `project_context_detail`; never fail the run. AC-10, 14, 16, 16a, 16b, 17, 18, 19.
9. **Client hooks.** Replace `useContextFiles` (envelope breaks bare array); list, preview, attach PUT hooks; effective list computed client-side (agent + linked skills' paths, deduped); delete `useReindexContext`. AC-1, 3, 7–9. Skill: react-best-practices.
10. **Context page.** Thin `page.tsx` + `_components` (groups, tokens, "Used by N agents", empty state, read-only Preview); delete chunk/reindex/edit strings in `context.json`. AC-1, 3, 4, 6. Skills: frontend-architecture, next-best-practices.
11. **Context tab** in AgentEditor/SkillEditor (`constants.ts` TABS): K of N attached, checkbox, drag + keyboard reorder, group badge, Preview, deduped total, inherited (non-removable) and "not found" rows; shared component (two consumers); empty state with disabled controls when no active repo (`repo-context.tsx`). AC-7–9, 13.
12. **Trace UI.** "Project context — attached specs (untrusted)" section in `TraceBody.tsx` (reuse `PromptBlock`/`PromptModalBody`), total tokens, skipped list; absent and error-free for old traces; `runs.json`. AC-20–22.
13. **Tests + typecheck** (see below). AC: all.

## AC coverage

AC-1: 2,3,5,9,10 · AC-2: 5 · AC-3: 2,5,9,10 · AC-4: 5,10 · AC-5: 3,5,6 · AC-6: 3,5,10 · AC-7/8: 2,4,6,9,11 · AC-9: 2,9,11 · AC-10: 5,8 · AC-11: 5,6 · AC-12: 4,6 · AC-13: 6,11 · AC-14: 8 · AC-15: 7 · AC-16: 3,8 · AC-16a: 8 · AC-16b: 7,8 · AC-17: 7,8 · AC-18: 2,8 · AC-19: 8 (negative: no versioning) · AC-20: 12 · AC-21/22: 2,12

AC-9 and AC-13 depend on the unresolved effective-list API decision.

## Test plan

- reviewer-core: `cd reviewer-core && npm test && npm run typecheck` — block/notice/per-doc wrap, literal `</untrusted>` in a doc, forged path/label, guard wording, omit-when-empty, `specs` absent.
- server unit: `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` — path validation (incl. symlink escape), grouping, effective-list dedupe/order with disabled skill, skip reasons/budget.
- server integration (Docker): `cd server && pnpm exec vitest run .it.test` — list/preview (422, missing clone, 500 cap + `truncated`), attach/replace, cascade (AC-12), used_by, run-executor with mock LLM, trace fields, missing doc doesn't fail run.
- `cd server && pnpm typecheck`
- client: `cd client && pnpm test && pnpm typecheck` — page, tab (attach, keyboard reorder, inherited/not-found), TraceBody present/skipped/old-trace, `AgentEditor.test.tsx` still green.
- e2e out of scope (regression run only if cheap).
- Manual: `pnpm db:migrate`, `./scripts/dev.sh`, attach docs, run a review, open trace.

## Risks

- Vendored contract drift between server/client copies.
- Integration tests skip without Docker — green `pnpm test` may not exercise DB paths.
- `INJECTION_GUARD` is shared → changes CI prompts despite AC-16b; `agent-runner/dist/` absent here, verify before merge.
- `SimpleGitClient.readFile` has no traversal guard (`simple-git.ts:129-131`).
- Tokenizing up to 500 files per list call vs p95 < 1 s; consider mtime cache, measure.
- AC-14 (default-branch working tree) unverified.
- `RunLogger` has only `info|tool|result|error` — use `info` for skips.
- Local Postgres volume may shadow seed data (`server/INSIGHTS.md`).
- Editors are not repo-scoped; "active repo" comes from `client/src/lib/repo-context.tsx`.
- Serialize edits to: `container.ts` (5), `adapters.ts` (3), agents/skills repositories (5,6), `hooks/core.ts` (9).

## Out of scope

Spec editing; architecture/security review (separate agents); editing docs, coverage score, indexing/embeddings, versioning, chunked retrieval, non-Markdown files, multi-repo; e2e flows; PR-list warning badge; UX extras listed in the spec; `agent-runner/dist/`, `clones/`, `.devdigest/cache/`; ESLint/dep-cruiser/root `package.json`.

## Resolved decisions (were open questions)

1. Endpoints: `GET /repos/:id/context` → `{files, truncated, reason?}`; `GET /repos/:id/context/preview?path=` → `{path, content}`; `PUT /agents/:id/context` and `PUT /skills/:id/context` with `{paths}`. Effective list computed on the client.
2. `specs` stays `string[]`; server pre-formats `### <sanitised path>` entries; core wraps with fixed `spec-${i}` labels and adds the notice.
3. PUT rejects non-`.md`, absolute, `..`, duplicate paths (422); existence not required; max 50 attachments.
4. `INJECTION_GUARD` change affecting CI prompts is accepted.
5. Read from the synced default-branch clone; verify at implementation that the run path syncs first, add a sync call if not.
6. No active repo → empty state, controls disabled.
7. Delete `IndexStatus`, `useReindexContext`, chunk/reindex/edit strings.
8. `used_by_agents` is global by path.
9. Per-doc tokens come from the list endpoint.
10. AC-20 total = sum of injected `project_context_detail[].tokens`.
11. p95 target: tokenize live, no cache; add mtime cache only if measured slow.

## Execution mode

Multi-agent pipeline (chosen by the user via `/run-plan`): implementer → plan-verifier → architecture-reviewer → review loop → doc-writer (`--docs`). Tests and security review are outside this pipeline.
