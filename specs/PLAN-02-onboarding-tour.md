# PLAN-02 — Onboarding Tour (Development Plan)

Implements [SPEC-02-onboarding-tour.md](SPEC-02-onboarding-tour.md). Produced by `implementation-planner`.
Status: **approved; execution mode = multi-agent pipeline** (implementer server phase, then client phase, then test-writer, plan-verifier, architecture-reviewer, doc-writer).

## User decisions
- Client route dir: client/src/app/repos/[repoId]/tour/ (URL /repos/:repoId/tour). API stays /repos/:id/onboarding. (Spec diagram/"cross-module" paragraph still say onboarding for the client route — treat `tour` as authoritative.)
- Implementer decides spec gaps: statuses 409 in-progress, 422 no_clone & index_unavailable, 502 llm_unavailable; `reason` in error.details.reason. Pin the Onboarding contract field list yourself (step 2).
- Nav icon: existing "Workflow" IconName. No `g` shortcut.

## Constraints
- Vendored shared contracts: edit BOTH server/src/vendor/shared/contracts/knowledge.ts and client/src/vendor/shared/contracts/knowledge.ts by hand, identical Onboarding block. Server is canonical.
- No migration; `onboarding` table (repo_id PK, json, generated_at) exists. Don't touch db/schema.
- client/src/vendor/ui/nav.ts is vendored UI: minimal deliberate edit only.
- Client: api.ts -> src/lib/hooks/* (TanStack Query) -> component; no direct fetch; feature UI in route `_components/`; page.tsx thin; no dangerouslySetInnerHTML; react-markdown with raw HTML off.
- Server: routes thin (Zod params/response, getContext, delegate), service, repository (owns DB). Workspace scoping via RepoRepository.getById(workspaceId, repoId). Errors from platform/errors.ts. Cross-module via container (repoIntel, llm, resolveFeatureModel). Use wrapUntrusted (platform/prompt.ts shim) and renderPrompt (platform/prompts.ts). DB-backed tests named *.it.test.ts.
- Do not touch reviewer-core, agent-runner/dist, clones/, .devdigest/cache/.
- REPO_INTEL_ENABLED=false makes repo-intel array methods return []; detect index_unavailable via getIndexState + config flag, not empty arrays.
- repoIntel.getFileContents has NO traversal guard (readClone = join+readFile, repo-intel/service.ts:777). Do NOT use it for validation; write a realpath-containment helper (e.g. server/src/adapters/git/repo-path.ts; see adapters/git/markdown-path.ts) with a file-size cap.
- In-flight lock: process-local in-memory per-repo lock, released in `finally`.
- GET response schema must be Onboarding.nullable().
- Caller counts ("N callers") computed in code from getBlastRadius (distinct caller files), never from LLM.

## Steps (server phase = 1-9, client phase = 10-14)
1. errors.ts: add ConflictError (409) + way to carry error.details.reason; reason constants (no_clone, index_unavailable, llm_unavailable, generation_in_progress) in modules/onboarding/constants.ts. Confirm app.ts error handler passes details through. AC-15, AC-16.
2. Replace Onboarding contract (version, index_files, generated_at, five sections: architecture{prose, diagram nodes/edges with kind enum}, critical paths{path, description, callers?}, run steps{command, comment?}, reading path, first tasks{title, description, files[]}) in BOTH vendored copies; remove OnboardingLink/OnboardingSection. Limits per spec (command single line <=300, <=12 nodes, 3-5 tasks). AC-27, 11-14, 6.
3. Update server/test/contracts.test.ts Onboarding case + negative cases. AC-27, 11, 12.
4. Rewrite server/src/prompts/onboarding.system.md (five sections, structured diagram, {{language}}, keep <untrusted> DATA clause; remove {{sections}}/mermaid). Check docs/agent-prompts README for listing. AC-7, 12, 28.
5. modules/onboarding/{helpers,types,constants}.ts: path validator, prose inline-code stripper, command validator (single line, no control chars, script existence in nearest manifest; `pnpm x` == `pnpm run x`), diagram sanitizer, first-task filter, critical-path seeding w/ caller counts, heading sanitizer; LLM response Zod schema; constants (key-file list, token budget, timeout, size cap, extension list). AC-9..14, 23.
6. repository.ts: getByRepoId (safeParse on read, warn + null on failure), upsert (generated_at=now(), onConflictDoUpdate). AC-6, 8, 17.
7. service.ts: get (404 if repo missing), generate (lock; no_clone; index_unavailable; gather grounding; truncate to budget; wrapUntrusted; renderPrompt; resolveFeatureModel(...,'onboarding') + container.llm completeStructured maxRetries 2; map errors to llm_unavailable; validate BEFORE upsert; index_files = IndexState.filesIndexed). Follow ConventionsService ordering. AC-7..16, 28.
8. routes.ts + register in modules/index.ts: GET /repos/:id/onboarding, POST /repos/:id/onboarding/generate (201). AC-6, 7, 16.
9. Tests: helpers unit tests (traversal, symlink, control chars, >12 nodes, bad edges); server/test/onboarding.it.test.ts modeled on conventions.it.test.ts (generate->GET->regenerate one row; failure keeps old tour; 3 reasons; concurrent 409; corrupt JSON -> null; other-workspace 404).
10. Client hook src/lib/hooks/onboarding.ts (useOnboarding, useGenerateOnboarding; surface ApiError.details.reason) + export in hooks/index.ts. AC-24, 26, 6.
11. nav.ts add {key:"onboarding-tour", label:"Onboarding Tour", icon:"Workflow", href:"/repos/:repoId/tour"} between pulls and context; fix activeKeyFor in client/src/components/app-shell/helpers.ts (map /repos/:repoId/tour, stop matching /onboarding add-repo); add helpers test. AC-1.
12. client/messages/en/onboarding.json rewrite (five sections, subtitle, buttons, per-reason messages, empty states, copy/share feedback). 
13. Page + _components under client/src/app/repos/[repoId]/tour/: TourView (loading, empty-state Generate CTA with no auto-generate and no Regenerate until tour exists, error banner), header (title, subtitle, Regenerate, Share link w/ selectable-field fallback), On-this-page nav w/ hash sync (scroll after data loaded), collapsible SectionCard (aria-expanded), section components (Architecture w/ react-markdown + deterministic SVG node/edge graph + kind colour map + ordered edge list for a11y; CriticalPaths w/ Open link to https://github.com/<full_name>/blob/<default_branch>/<path> URL-encoded per segment, target=_blank rel=noopener noreferrer; RunLocally copy only `command`, aria-live; ReadingPath; FirstTasks), helpers.ts, styles.ts. AC-2..5, 18..26, 28.
14. Client tests (RTL+vitest): five sections render, collapse independence, anchor nav expands, copy writes only command, share link + fallback, empty section state, first-visit CTA, Regenerate failure keeps old tour.

## Test plan
- server: `pnpm typecheck`; `pnpm exec vitest run --exclude '**/*.it.test.ts'`; `pnpm exec vitest run .it.test` (self-skips w/o Docker — report if skipped)
- client: `pnpm typecheck`; `pnpm test`; `pnpm build`
- Manual: diff Onboarding block between the two vendored knowledge.ts.
Out of scope: g-shortcut, e2e flow, conventions feed, dangerous-command filtering, scroll-spy, stale banner, Regenerate confirm.
