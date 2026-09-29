# Plan: PR Why + Risk Brief  |  Implements SPEC-03  |  Status: approved

Spans `server/` and `client/` (plus both vendored `brief.ts` copies). No `reviewer-core` change, no migration (`pr_brief` table exists), no root `package.json`.

## Decisions (user-approved)
- Attached specs = union of effective doc paths across all **enabled agents** in the workspace (new `ContextRepository` query, deduped, deterministic order).
- Contract: flat `risks: Risk[]`, `Risk.kind` optional. `intent`/`blast`/`history` removed from `PrBrief`; `Intent`/`BlastRadius`/`PrHistory`/`Risk`/`Risks` exports stay.
- Risk file-ref click navigates with `?tab=diff&file=<path>` (no `line`); the client treats a missing `line` as valid.
- Execution: multi-agent pipeline (implementer → test-writer → plan-verifier → architecture-reviewer → doc-writer).
- Defaults accepted: import `diffFromPrFiles` from `../reviews/diff-loader.js`; PrBriefCard at top of Overview; limits 8 risks / 5 focus; generate route rate limit 10/min.
- HTTP mapping: `llm_unavailable` and `generation_failed` → ExternalServiceError 502; `no_files` → ValidationError 422; in-flight → ConflictError 409 with `reason: 'generation_in_progress'`.

## Verified findings
1. `completeStructured` returns `{data, model, tokensIn, tokensOut, costUsd|null, attempts}`; store `usage = {prompt_tokens, completion_tokens, cost_usd}`. UI hides the usage line when tokens are 0 and cost is null/0. Mock LLM returns 100/50/0.001.
2. Hunk ranges: use `diffFromPrFiles(container.reviewRepo, prId)` (built from `pr_files.patch`, same source as the client render), NOT `loadDiff`. Right-side range = `[newStart, newStart+max(newLines,1)-1]`. `pr_files` has no status column: "deleted" is inferred from a patch with no right-side lines; null patch = no hunks → focus item dropped.
3. `loadProjectContext` is reusable but needs a `RunLogger`; widen its logger param to `{ info(msg: string): void }` (backward compatible) and pass a pino-backed logger. It does a `git.sync` fetch; best-effort, never fails generation.
4. Client: `usePrDetailPage` reads only `tab`/`trace`; `FileCard` has no id/scroll/focus; `SmartDiffView` keeps groups collapsed and forces `initialOpen={false}`, so focus must open the group AND the card. Add a generic optional `focus` prop through `DiffViewer → FileCard → CodeLine` (no route imports). jsdom lacks `scrollIntoView` (stub in tests).
5. Closest server pattern: `modules/onboarding` (in-flight Set with `finally`, nullable GET, upsert, safeParse-on-read → null, `renderPrompt`, `resolveFeatureModel`, `ApiError.details.reason`).

## Steps
Server phase (1-9), then client phase (10-17). Step 1 first.

1. **Contract** in BOTH `server/src/vendor/shared/contracts/brief.ts` and `client/src/vendor/shared/contracts/brief.ts`: `PrBrief = { summary, risks: Risk[], review_focus: {file, line:int>0, reason}[], missing: ('intent'|'blast'|'specs')[], generated_at, generated_for_sha, model, usage: {prompt_tokens, completion_tokens, cost_usd: number|null}.nullable() }`; `Risk.kind` optional; add `BriefErrorReason` (`llm_unavailable|no_files|generation_failed|generation_in_progress`). Server first, then mirror; diff by eye. — AC-14, 12, 4 — skill: zod
2. **Contract tests** in `server/test/contracts.test.ts`: add `PrBrief` cases (valid, missing summary, bad severity, line ≤0 rejected, usage null); keep existing cases green. — AC-14
3. **Module scaffolding**: `server/src/modules/brief/{constants,types}.ts` (prompt name, limits, string caps, MAX_CALLER_FILES, MAX_PROMPT_FILES, retries, lenient `BriefLlmResponse` Zod like onboarding/types.ts) and `server/src/prompts/risk-brief.system.md` (inputs are DATA; don't invent motivation; absent inputs are explicit; ordered reading list). Confirm `platform/prompts.ts` loader rules. — AC-3, 5, 6, 10
4. **Pure helpers + unit tests** (`helpers.ts`, `helpers.test.ts`): `hunkRangesByFile`, `formatFileInputs` (path, +/-, role, hunk ranges only; sorted by role then churn; "N more files omitted"; use `sanitizePathForHeading`), `normalizePath`, `validateBrief` (drop bad file_refs, keep risk without refs, drop focus with unknown/deleted/no-hunk file, snap line to nearest hunk start, dedupe, caps, string lengths), `buildMissing`, `isEmptyBrief`, `describeMissingInputs`. — AC-5, 6, 8, 9, 10, 11
5. **Specs plumbing**: widen `loadProjectContext` logger type in `server/src/modules/reviews/project-context.ts` (existing tests untouched); add `ContextRepository.workspaceEffectivePaths(workspaceId)` in `server/src/modules/context/repository.ts` (enabled agents' `effectivePaths` unioned, `dedupePaths`). — AC-5, 6 — skill: drizzle-orm-patterns
6. **Repository** `brief/repository.ts`: `getByPrId` (safeParse → null + warn on failure), `upsert` (`onConflictDoUpdate` on `pr_id`). — AC-1, 2, 3, 12 — skills: drizzle-orm-patterns, onion-architecture
7. **Service** `brief/service.ts`: `get` and `generate` (guard `getPull`; in-flight Set → 409; zero files → 422 before any LLM call; read pull once; hunks via `diffFromPrFiles`; roles via `classifyFile`; intent via `reviewRepo.getIntent` ONLY, never extract; blast via `repoIntel.getBlastRadius` guarded by `repoIntelEnabled`/`degraded`, calling files capped; specs via `loadProjectContext` + step-5 resolver; each input in its own try/catch → `missing[]`; all text in `wrapUntrusted`; explicit "Absent inputs" line; `resolveFeatureModel(..., 'risk_brief')`; exactly ONE `completeStructured`; map errors; `validateBrief`; empty → `generation_failed` without upsert; assemble with `generated_for_sha = pull.headSha`, usage from the result; `PrBrief.safeParse`; upsert). Log only names/sizes/model/cost. — AC-1, 3, 4, 4b, 5-12 — skills: onion-architecture, security
8. **Routes** `brief/routes.ts` + register in `server/src/modules/index.ts`: `GET /pulls/:id/brief` (200 `PrBrief.nullable()`), `POST /pulls/:id/brief/generate` (201 `PrBrief`, rateLimit 10/min). — AC-1, 3, 4b — skill: fastify-best-practices
9. **Server integration test** `server/test/brief.it.test.ts` (model on onboarding.it.test.ts; `MockLLMProvider` `structuredBySchema`): null → generate → GET; one row after regenerate; usage stored; hallucinated file dropped and line snapped; `missing[]` combos; `no_files` with zero LLM calls; LLM failure/empty keeps previous brief; concurrent POST → 409; corrupted JSON → null; other workspace → 404; exactly one `completeStructured` per generate. Don't assert 429 (disabled in test env). — AC-1, 2, 3, 4, 4b, 6-9, 11, 12
10. **Client hooks** `client/src/lib/hooks/brief.ts` (`useBrief`, `useGenerateBrief` with `setQueryData(["pr-brief", prId])`, `briefErrorReason` from `ApiError.details.reason`) + export in `hooks/index.ts`; mirror `hooks/onboarding.ts`. — AC-15, 16, 4
11. **i18n** `client/messages/en/brief.json`: `block.risks` → "Risk areas"; add `block.focus`, summary/generate/generating/refresh/stale, `missing.*`, usage, `error.*` per reason, `severity.*`. Existing IntentCard/BlastRadiusCard hard-coded English stays out of scope. — AC-22 (+16, 18, 19, 20, 13)
12. **Shared diff-viewer focus**: optional `focus?: {file; line: number|null}` on `DiffViewer`/`FileCard`/`CodeLine` (`components/diff-viewer/*`); `fileAnchorId(path)` helper; FileCard opens when focused (initializer + effect keyed on focus) and `useEffect` scrolls (guard `scrollIntoView`); CodeLine highlights `newNo === focusLine` only. Unknown file/line renders normally. Do this before step 13. — AC-21 — skills: react-best-practices, frontend-architecture
13. **Route wiring**: `usePrDetailPage` parses `file`/`line` (ignore garbage) into `focus`; `navigateToFile(file, line?)` sets `tab`, `file`, `line` in one `router.replace` via `URLSearchParams`, preserving `trace`; `PrDetailView` passes `focus` to `DiffTab` and `onOpenFile` to `OverviewTab`; `DiffTab` forwards to `DiffViewer`/`SmartDiffView`; `SmartDiffView` force-opens the focus file's group. Works in Smart and Original order. — AC-21 — skill: next-best-practices
14. **PrBriefCard** under `.../pulls/[number]/_components/OverviewTab/` (`PrBriefCard.tsx`, `RiskList.tsx`, `ReviewFocusList.tsx`, `helpers.ts`, `constants.ts`, styles): states loading / empty (single Generate button, no auto call) / generated (VerdictBanner with brief summary when a review exists, else plain summary + Refresh; Risk areas with severity icon + text label + file-ref buttons → `onOpenFile(file)`; `noRisks`; Review focus `<ol>` of `file:line — reason` → `onOpenFile(file, line)`; stale notice when `generated_for_sha !== headSha`; missing notes; usage line hidden when tokens 0) / pending (disabled, spinner, `aria-busy`) / error (`aria-live="polite"`, reason-specific message, previous brief stays). Plain text only. Prefer inline expansion over popovers (client INSIGHTS). — AC-13, 15-21b, 22, 23
15. **Compose** in `OverviewTab.tsx`/`styles.ts`: PrBriefCard at top, IntentCard + BlastRadiusCard side by side (stack on narrow widths), `onOpenFile` prop; PriorPrs untouched. Do with step 14's styles in one pass. — AC-15, 20
16. **Client tests**: `PrBriefCard.test.tsx` (empty, generate flow, risks with severity text, ordered focus list, usage, noRisks, stale, missing notes, failure keeps previous brief, VerdictBanner vs plain, click callbacks); extend `DiffTab.test.tsx` (focus opens group + card, highlight marker, stubbed `scrollIntoView`, both orders, unknown file/line); unit test for the URL-param builder (encodes spaces/`&`/unicode, ignores bad `line`). — AC-13, 15-21b, 22, 23
17. **Docs/drift**: server README API map rows for the two routes; manual diff of the two vendored `brief.ts` copies. Leave SPEC-03 status untouched.

## AC coverage
AC-1: 6,7,8,9 · AC-2: 6,9 · AC-3: 3,7,8,9 · AC-4: 1,3,7,9,10,16 · AC-4b: 7,8,9,16 · AC-5: 3,4,5,7 · AC-6: 3,4,5,7,9 · AC-7: 7,9 · AC-8: 4,7,9 · AC-9: 4,7,9 · AC-10: 3,4,7 · AC-11: 4,7,9 · AC-12: 1,6,7,9 · AC-13: 11,14,16 · AC-14: 1,2 · AC-15: 10,14,15,16 · AC-16: 10,11,14,16 · AC-17: 14,16 · AC-18: 11,14,16 · AC-19: 11,14,16 · AC-20: 11,14,15 · AC-21: 12,13,14,16 · AC-21b: 7,11,14,16 · AC-22: 11,14,16 · AC-23: 14,16

## Test plan
- `cd server && pnpm typecheck`
- `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` (unit lane; `project-context.test.ts` must stay green)
- `cd server && pnpm exec vitest run .it.test` (needs Docker; report if skipped)
- `cd client && pnpm typecheck`, `pnpm test`, `pnpm build`
- Manual: diff the two vendored `brief.ts`; `./scripts/dev.sh`, Generate brief, reload, click a focus item, check Files tab in Smart and Original order. No `db:migrate`.

## Risks
- Specs union changes prompt content/cost; `loadProjectContext` does a `git.sync` fetch, so generation may be slow offline (never fail on it).
- Focus scroll timing: FileCard open state is initialized once; a later `?file` change needs the effect. Highlight only right-side (`newNo`) lines.
- Vendored copies already drift; only the PrBrief block and error reasons must match.
- In-flight lock is process-local (same as onboarding).
- `cost_usd` may be null with tokens present (cold OpenRouter price cache); UI must tolerate it.
- All PR text, Intent, docs, paths and caller names reach the model: wrap, sanitize, validate output; render as text only.

## Out of scope
Spec edits, e2e flow, auto-generation, history/versions/export, streaming, PR-state gating, i18n of existing Intent/Blast cards, distributed locking, reviewer-core.
