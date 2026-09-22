# Agents

Map of the subagents defined in this directory. Each `.md` file is the full
source of truth for its agent (frontmatter + system prompt) — this README
doesn't duplicate that text, only summarizes responsibilities, permissions,
and how the agents chain together.

## Pipeline

```
researcher (optional, ad hoc)
      │
planner  ──Development Plan──▶  implementer  ──Implementation Report──▶  test-writer (optional, backfills coverage)
                                                                              │
                                                        ┌─────────────────────┴─────────────────────┐
                                                        ▼                                             ▼
                                                  plan-verifier                              architecture-reviewer
                                            (fact-checks the plan's claims)              (layering/boundary judgment)
                                                        │                                             │
                                                        └─────────────────────┬─────────────────────┘
                                                                              ▼
                                                                         doc-writer
```

`planner` and `implementer` are designed as a pair: the planner produces a
Development Plan document, the implementer consumes exactly that document and
executes it. `researcher` is independent and can be invoked any time a
question needs grounded evidence rather than a code change. `test-writer`
slots in right after `implementer`, the same way `researcher` is optional —
only needed when coverage is actually missing — and can also run standalone
to backfill tests for existing, unplanned code. `plan-verifier` and
`architecture-reviewer` both consume the Implementation Report but check
different things (concrete fact-checking vs. architectural judgment) and
don't depend on each other's output, so they can run in either order or in
parallel. `doc-writer` runs last, after any fixes from review are applied,
since docs should describe the final shipped state. None of the seven
performs security review — that still happens separately (e.g. the
`security-review` skill).

## Agent summary

| Agent | Responsibility | Tools (permissions) | Model | Input | Output |
|---|---|---|---|---|---|
| [planner.md](planner.md) | Turn a task description into a structured, groundable Development Plan for a non-trivial/multi-file/cross-package change. Read-only — never edits code, invokes Skills, or runs commands. | `Read, Grep, Glob` | `sonnet` | A task/feature/fix description | A **Development Plan** (packages touched, architectural constraints with sources, ordered steps with file paths + applicable skill per step, test plan, risks, out-of-scope, open questions) |
| [implementer.md](implementer.md) | Execute an approved Development Plan across `client/`, `server/`, `reviewer-core/`, `e2e/`. Applies the skill each plan step names, edits code, runs the affected package's test/typecheck suite, and checks its own diff stays within the plan's scope. | `Read, Grep, Glob, Edit, Write, Bash, Skill` | `sonnet` | A Development Plan (from `planner`, or explicit confirmation none is needed) | An **Implementation Report** (files changed, skills applied, commands run + pass/fail, self-verification, explicit "not covered" section flagging that review still needs to run) |
| [researcher.md](researcher.md) | Answer a specific, evidence-backed question — repo research (code/docs/git history) and/or external research (docs, changelogs, web) — without writing or editing anything. Refuses to invoke `/deep-research`. | `Read, Grep, Glob, Bash, WebFetch, WebSearch` | `sonnet` | A specific, scoped question (asks clarifying questions first if the request is ambiguous or open-ended) | A **research report** (Question, Conclusions, Evidence with citations, References, Could-not-find) |
| [test-writer.md](test-writer.md) | Write/extend UI, backend, engine, and e2e-flow tests for a completed change, following each package's real test conventions. Restricted to test files only — never edits production source, reports a bug instead of fixing it — and runs the real test command to report actual pass/fail. | `Read, Grep, Glob, Write, Edit, Bash, Skill` | `sonnet` | An Implementation Report, or a feature/bug description needing coverage | A **Test Report** (files written, skills applied, scenarios & why, commands run + pass/fail, source bugs found but not fixed) |
| [architecture-reviewer.md](architecture-reviewer.md) | Read-only review of a given file list/scope against `onion-architecture` (server/reviewer-core) and `frontend-architecture` + `next-best-practices` (client) layering rules. Evidence-cited findings only, no fixes. | `Read, Grep, Glob` | `sonnet` | A file list/scope (e.g. from an Implementation Report) | A severity-graded **Findings report** (file:line evidence, documented exceptions checked, no fixes) |
| [plan-verifier.md](plan-verifier.md) | Verifies a completed implementation against every item and Test plan command in a Development Plan; re-runs the plan's own test commands for real rather than trusting self-reported pass/fail. Does not judge code quality, architecture, or fix anything. | `Read, Grep, Glob, Bash` | `sonnet` | A Development Plan (+ optional Implementation Report) | A **Verification Report** (per-step VERIFIED/NOT DONE/PARTIAL, test-plan pass/fail, constraint compliance, overall verdict) |
| [doc-writer.md](doc-writer.md) | Converts a shipped feature/plan/report into documentation in the correct `docs/` location, updating that location's index/table and adding Mermaid diagrams via the `mermaid-diagram` skill. Never writes to `specs/` (pre-implementation territory) or touches source code. | `Read, Grep, Glob, Write, Edit, Skill` | `sonnet` | Development Plan / Implementation Report / feature description | Written/updated docs + index updates + diagrams |

## Preloaded skills

Preloading is scoped to what each agent actually needs — it is **not** a
repo-wide rule that every code-touching agent gets the full set:

- **planner** and **implementer** preload the same full set of engineering
  skills for awareness/application: `frontend-architecture`,
  `react-best-practices`, `next-best-practices`, `react-testing-library`,
  `fastify-best-practices`, `drizzle-orm-patterns`, `onion-architecture`,
  `postgresql-table-design`, `zod`, `typescript-expert`, `security`.
  - **planner** reads this content to decide which skill applies to each
    plan step and to avoid planning something a skill's rules would
    conflict with. It cannot invoke a skill (no `Skill` tool).
  - **implementer** invokes skills (via the `Skill` tool) as directed by the
    plan's per-step skill assignment, applying the preloaded rules; for a
    skill outside the preloaded set, it discovers and invokes it explicitly.
- **test-writer** preloads a narrower subset: `react-testing-library`,
  `fastify-best-practices`, `onion-architecture` — the testing-relevant
  slice, not the full engineering set. Its system prompt explicitly flags
  that `fastify-best-practices`' testing examples use `node:test` syntax
  while this repo's actual tests use `vitest` — apply the skill's concepts,
  not its literal syntax.
- **architecture-reviewer** preloads a different subset:
  `onion-architecture`, `frontend-architecture`, `next-best-practices` — the
  layering/boundary skills only, not code-quality or domain skills.
- **plan-verifier** and **doc-writer** preload no skills. `plan-verifier`'s
  job is concrete fact-checking, not skill-based judgment, so skill content
  is deliberately withheld to keep it from substituting commentary for
  verification. `doc-writer` invokes `mermaid-diagram` explicitly via the
  `Skill` tool per diagram, the same on-demand pattern `implementer` uses for
  skills outside its preloaded set.
- **researcher** has no skill access at all (no `Skill` tool, no preloaded
  list).

## Sources for these agents' rules

Every agent's constraints (vendored Zod contracts, migrations not run on
server boot, do-not-touch paths, no workspace tooling, scaffolded-but-unused
`server/src/modules/` slots, per-package test/doc conventions) are drawn
from, and must be re-checked against:

- **`CLAUDE.md`** (repo root) — package map, non-default conventions,
  gotchas, do-not-touch list.
- **Each affected package's `AGENTS.md`** (`server/AGENTS.md`,
  `client/AGENTS.md`, `reviewer-core/AGENTS.md`, `e2e/AGENTS.md`) — package
  boundaries, architectural rules, and test conventions specific to that
  package.
- **Each affected package's `INSIGHTS.md`** — prior non-obvious findings,
  dead ends, and workarounds from past sessions.
- **`TESTING.md`** — test strategy and suite map, used by `test-writer` and
  `plan-verifier` to sanity-check test commands and coverage philosophy.
- **Each package's `docs/README.md` and `specs/README.md`**, plus root
  `README.md`'s "Deeper docs" table — used by `doc-writer` to place new
  documentation correctly and keep it discoverable.
- **The preloaded skills** listed above (scoped per agent), plus
  `.claude/skills/*/SKILL.md` for anything outside that preloaded set.

`planner` cites these sources per constraint in its Development Plan output
(`<constraint> — <source: AGENTS.md / INSIGHTS.md / skill name, with path>`).
`implementer` follows the plan's citations rather than re-deriving them, but
still applies the repo-wide conventions directly from `CLAUDE.md` (vendored
contracts, migrations, do-not-touch) as a standing checklist during
execution. `test-writer`, `plan-verifier`, and `doc-writer` each re-derive
the subset of these conventions relevant to their own role directly from the
same sources, rather than trusting a prior agent's report.

## Notes

- None of these agents has the `Agent` tool — they cannot spawn further
  subagents (including each other or review agents). Chaining
  researcher → planner → implementer → test-writer → plan-verifier /
  architecture-reviewer → doc-writer is done by the parent session, not by
  the agents themselves.
- Architectural and security review are explicitly out of scope for
  `planner`, `implementer`, `researcher`, `test-writer`, `plan-verifier`, and
  `doc-writer` — each of their output formats has an "Out of scope" / "Not
  covered" section calling this out so the review step isn't skipped.
  `architecture-reviewer` performs architectural review but not security
  review; security review still happens separately (e.g. the
  `security-review` skill).
- `architecture-reviewer` and `plan-verifier` are both read-mostly by design
  (no `Write`/`Edit`) so they can never "fix" what they're supposed to be
  checking — findings only, evidence-cited, deferred to a human or to
  `implementer` to act on.
