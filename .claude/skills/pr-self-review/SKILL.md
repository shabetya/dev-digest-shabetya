---
name: pr-self-review
description: "Reviews all pending local changes (staged, unstaged, and committed-but-unpushed against main) before a PR is opened, by routing each changed file to whichever existing skills actually cover it — UI skills only run on UI files, backend skills only run on backend files. Use when the user asks to self-review before opening a PR, review pending/local changes, or invokes /pr-self-review. Refuses to give a clean report while any CRITICAL finding is open — the PR must not be opened or merged until it's fixed or explicitly dismissed. Orchestrates existing skills; does not duplicate their rule content."
---

# PR Self Review

Routes a pending diff to the existing skills that actually cover the files it
touches, runs each against only its own slice, and gates on CRITICAL
findings. See `examples.md` for two worked runs, `references.md` for where
the routing table comes from.

Sibling skills — this skill orchestrates and gates, it does not restate their
rules:
- `frontend-architecture`, `react-best-practices`, `react-testing-library`,
  `next-best-practices` — the UI-side checks it delegates to
- `fastify-best-practices`, `onion-architecture`, `drizzle-orm-patterns`,
  `postgresql-table-design` — the backend-side checks it delegates to
- `security`, `zod`, `typescript-expert` — the cross-cutting checks it always
  considers when relevant files changed
- `code-review` / `security-review` (global skills) — general-purpose
  reviewers with no repo-specific routing; this skill is what to reach for
  specifically before opening a PR in this repo

## When to use

Manual invocation only, on request: "self-review before I open a PR",
"review my pending changes", "check what I'm about to PR", or `/pr-self-review`.
There is no automatic trigger yet — see "Future enhancement" below.

## Step 1 — Scope the diff

Review exactly what would go into the PR, nothing more:

```
git merge-base main HEAD   # or the actual base branch if not main
git diff <merge-base>...HEAD   # committed changes not yet on the base branch
git status --porcelain          # + working-tree changes (staged and unstaged)
git diff                        # unstaged
git diff --cached               # staged
```

Do not review the whole repository and do not re-flag anything outside this
diff — pre-existing issues in untouched code are out of scope for a PR
self-review.

## Step 2 — Map changed files to skills

Match every changed file against this table. A file can match more than one
row (e.g. a Drizzle schema file matches both `drizzle-orm-patterns` and
`zod`) — run every skill that matches.

| Skill | Glob(s) | Category |
|---|---|---|
| `frontend-architecture` | `client/src/app/**`, `client/src/components/**`, `client/**/*.tsx` | UI |
| `react-best-practices` | `client/**/*.tsx`, `client/src/lib/hooks/**/*.ts` | UI |
| `react-testing-library` | `client/**/*.test.tsx`, `client/**/*.test.ts` | UI |
| `next-best-practices` | `client/src/app/**`, `client/next.config.*` | UI |
| `fastify-best-practices` | `server/src/modules/**`, `server/src/platform/**`, `server/src/app.ts`, `server/src/server.ts` | Backend |
| `onion-architecture` | `server/src/**`, `reviewer-core/src/**` | Backend |
| `drizzle-orm-patterns` | `server/src/db/**`, `**/*schema*.ts`, drizzle migrations | Backend |
| `postgresql-table-design` | `server/src/db/schema*.ts`, `server/drizzle/**` | Backend |
| `zod` | `**/*schema*.ts`, `server/src/vendor/shared/**`, `client/src/vendor/shared/**`, `reviewer-core/src/**` | Backend + shared |
| `typescript-expert` | `**/*.ts`, `**/*.tsx` | Cross-cutting, always-on |
| `security` | `server/**` (primary), `client/**` (forms/XSS) | Cross-cutting, always-on if either touched |

**Maintenance note:** this table must be updated whenever a skill is added
to or removed from `.claude/skills/` — check `.claude/skills/README.md`'s
catalog for drift before trusting this table on an unfamiliar repo state.

**Vendored-shared-contract check (independent of the table above):** if the
diff touches `server/src/vendor/shared/**` or `client/src/vendor/shared/**`
but not both, always surface at least a MEDIUM finding — per this repo's
`CLAUDE.md`, the two copies are hand-synced and already known to drift.

**Unmapped files:** list any changed file that matches no row (e.g. `e2e/**`,
docs, config, `.github/workflows/**`) under an explicit "not covered by any
skill" heading in the report — do not silently drop them.

## Step 3 — Run only the matched skills

For each matched skill, load it and run its own review process against only
the files that matched it — not the whole diff. `typescript-expert` and
`security` run whenever any matching file changed, regardless of what else
matched. A skill with zero matching files in this diff is skipped, and the
skip is stated in the final report (so the full skill list is visibly
considered, not silently ignored).

Delegate to each skill's own judgment and process (e.g. `security/SKILL.md`
already has its own "Security Review Process" and confidence rules) — this
skill's job is routing and gating, not re-deriving architecture or security
rules inline.

## Step 4 — Consolidate findings

Merge every matched skill's output into one report, grouped by severity,
then by skill, then by file:

| Severity | Meaning |
|---|---|
| **CRITICAL** | Will break, is exploitable, or violates a hard rule with no exception (e.g. a security skill's own CRITICAL, a layering rule broken with no workaround, a schema change with no migration) |
| **HIGH** | Likely to cause a real bug or maintenance problem, but not an immediate break |
| **MEDIUM** | Real but limited-impact deviation from the matched skill's guidance |
| **LOW** | Style/defense-in-depth; do not surface unless asked |

For findings from `security/SKILL.md`, use its own Severity Classification
table verbatim rather than re-judging against the generic table above — it's
more specific for that domain.

Cap each skill to its most important findings (roughly top 5, ranked by
severity) rather than dumping every observation — an unbounded list trains
people to skim past the report instead of acting on it.

## Step 5 — Gate

If any finding is CRITICAL: state explicitly that this PR must not be opened
or merged until every CRITICAL finding is either fixed or dismissed (see
below), and do not produce a "looks good" summary. Non-critical findings are
reported but do not block.

**Dismissing a finding:** the user can dismiss a specific finding for this
review by stating a reason ("dismiss the X finding — Y is intentional
because Z"). A dismissed finding is excluded from the gate but still listed
in the report as dismissed, with its reason, so the review stays honest about
what was overridden rather than making the finding disappear.

This is a local gate only — it stops this skill from reporting a clean
result and can refuse to proceed on request, but it cannot disable GitHub's
merge button. There is no branch-protection or CI tie-in for this repo today.

## What NOT to flag

- Anything already caught by CI (typecheck, unit/integration tests per
  package) — don't re-run or restate what `pnpm typecheck` / `pnpm test`
  already cover.
- Pre-existing issues outside the diff, even in a file the diff touches —
  only the changed lines/hunks are in scope.
- `LOW` severity findings, unless explicitly asked for a fuller pass.
- A skill's own "do NOT flag" list applies here too (e.g. `security/SKILL.md`
  excludes test files, dead code, and framework-mitigated patterns — don't
  override that with a broader net).

## Future enhancement (not built yet)

An automatic trigger — a `PreToolUse` hook in `.claude/settings.json`
matching `gh pr create` (and optionally `git push` to a non-main branch)
that runs this skill first and blocks the command on a CRITICAL finding —
is a natural next step but is out of scope today. Don't assume it's wired up;
this skill only runs when invoked.
