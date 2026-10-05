# Findings ledger — PLAN-03

Note: architecture-reviewer read service.ts and routes.ts in full and the rest via grep/imports; it did not open styles files, SmartDiffView/PrDetailView, or the system prompt. Vendored contract copies were confirmed identical by plan-verifier (`diff` clean).

## Architecture review

| ID | Sev | Location | Rule | Status |
|----|-----|----------|------|--------|
| F-1 | MEDIUM | server/src/modules/brief/service.ts:12-16, brief/helpers.ts:2 | Cross-module source imports (`blast/helpers`, `reviews/project-context`, `reviews/smart-diff/classify`, `reviews/diff-loader`). Fix: move pure functions to `_shared`. | partly fixed — `sanitizePathForHeading`, `classifyFile`, `mapBlastResult` moved to `server/src/modules/_shared/`; `loadProjectContext` and `diffFromPrFiles` still imported from `reviews/` (accepted, same precedent as intent/onboarding) |
| F-2 | LOW | server/src/modules/brief/service.ts:57-62 | DI — takes whole `Container`; `BriefRepository` built per module, not a container getter. | deferred — matches existing services |
| F-3 | LOW | server/src/modules/brief/repository.ts:12 | `BriefLogger` declared in repository.ts instead of types.ts. | fixed — moved to `brief/types.ts` |
| F-4 | LOW | server/src/modules/brief/service.ts:200 | `mapBlastResult(result, []).summary` used only to get the summary string; couples brief to blast's DTO shape. | deferred — rebuilding the summary would duplicate endpoint/cron counting or change prompt text |
| F-5 | LOW | client/src/components/diff-viewer (`focus` prop) | Shared component gained a `focus` prop. | no change needed — reviewer judged it domain-agnostic, two consumers, single optional prop |

## Plan verification (plan-verifier)

Verdict: plan substantially satisfied. All commands in the Test plan re-run and passed: server typecheck; unit lane 24 files / 213 tests; `.it.test` lane (Docker up) 12 files / 58 tests incl. `brief.it.test.ts` (6); client typecheck; client tests 33 files / 101 tests; client build. Steps 1-16 verified. Constraints held: vendored `brief.ts` copies identical, no migration or schema change, no reviewer-core / `agent-runner/dist` / `clones` / `.devdigest/cache` / root `package.json` changes. AC-1..AC-23 (incl. 4b, 21b) all covered.

| ID | Sev | Location | Finding | Status |
|----|-----|----------|---------|--------|
| V-1 | LOW | server/README.md | Step 17: no API-map rows for `GET /pulls/:id/brief`, `POST /pulls/:id/brief/generate`. | fixed — doc-writer added a "PR brief" node to the API-map flowchart; also added docs/pr-brief.md and an AGENTS.md row |
| V-2 | LOW | — | Manual `./scripts/dev.sh` walk-through (Generate, reload, focus click, Smart/Original order) not run by the verifier. | open — partly exercised by the user in the browser (see Post-verification fixes) |
| V-3 | LOW | brief.it.test.ts / PrBriefCard.test.tsx | Verifier could not confirm an integration assertion for hallucinated-file drop and line snap (covered by `helpers.test.ts` unit tests) nor a dedicated client generate-flow test. | deferred |
| V-4 | INFO | OverviewTab / BlastRadiusCard | AC-20: brief card shows `missing.*` notes; Intent/Blast cards themselves do not read `missing[]`. Counted as covered. | accepted |

## Post-verification fixes (found by the user running the app)

| ID | Sev | Location | Finding | Status |
|----|-----|----------|---------|--------|
| P-1 | LOW | client/.../OverviewTab/BlastRadiusCard.tsx | Pre-existing bug, not from this feature: two same-named changed symbols gave duplicate React key and shared open state. | fixed — key/open-state use `symbol#index` |
| P-2 | INFO | Settings | "language model is unavailable" on Generate: `risk_brief` defaults to OpenAI, only an OpenRouter key is configured. Configuration, not a code defect. | resolved by user choosing an OpenRouter model in Settings → Feature models (recommended) |
| P-3 | LOW | client/.../OverviewTab/styles.ts | Risk file links wrapped in a row; requested one-per-line. | fixed — `riskRefs` is a column |

## Known limitations carried forward
- `server/src/prompts/risk-brief.system.md` is not copied to `dist` by `pnpm build` (same limitation as the other prompts).
- In-flight generation lock is process-local.
- Generation triggers a `git.sync` fetch inside `loadProjectContext` when specs are attached (best-effort, never fails generation).
- Security review not yet run on this feature.
