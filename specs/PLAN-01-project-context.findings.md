# Findings ledger — PLAN-01

Note: architecture-reviewer read only part of the scope in full (rest via grep); vendored contract copies were confirmed identical by plan-verifier.

| ID | Sev | Location | Rule | Status |
|----|-----|----------|------|--------|
| F-1 | MEDIUM | server/src/modules/reviews/project-context.ts:70, server/src/modules/context/helpers.ts:12, server/src/adapters/git/simple-git.ts:170 | Ports & Adapters; no cross-module imports — `too_large` classified by regex on error message, rule duplicated. Fix: typed `DocTooLargeError` next to `InvalidMarkdownPathError`, throw from simple-git + mocks, use `instanceof` in both places. | open |
| F-2 | LOW | server/src/modules/context/service.ts:43-64 | Resource concern, not a violation — live tokenizing of up to 500 files per list call, no cache. | deferred — spec Decision 11: tokenize live, add cache only if measured slow |
| F-3 | LOW | server/src/modules/context/service.ts:16-19 | DI — takes whole `Container` for `git`+`tokenizer`. | deferred — cosmetic, matches existing services |
| F-4 | LOW | client/src/components/context-docs/ContextAttachPanel.tsx:10 | Shared component depends on `useActiveRepo`. | deferred — reviewer accepts as is (two consumers) |
