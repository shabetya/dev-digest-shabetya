# Agents

Map of the subagents defined in this directory. Each `.md` file is the full
source of truth for its agent (frontmatter + system prompt) — this README
doesn't duplicate that text, only summarizes responsibilities, permissions,
and how the agents chain together.

## Pipeline

```
researcher (optional, ad hoc, fan-out — 1 invocation per independent question)
      │  ▲
      │  └── answers a question spec-creator flagged mid-draft (it has no
      │      Bash/WebFetch/WebSearch/Agent tool to research anything itself)
      ▼
spec-creator (optional, ad hoc — before scoping starts)
      │  Spec written to <package>/specs/SPEC-NN-*.md, or top-level
      │  specs/SPEC-NN-*.md for a multi-module spec (incl. any e2e-scoped one)
      ▼
implementation-planner  ──Development Plan──▶  implementer  ──Implementation Report──▶  test-writer (optional, backfills coverage)
      │  asks: multi-agent pipeline, or single-agent pass?
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

`spec-creator` is optional and ad hoc, the same way `researcher` is: use it
when a feature is worth scoping with Spec-Driven Development before any
planning starts. It writes one spec file and stops — into a single
package's own `specs/` folder if the spec's own goals/acceptance criteria
stay within that package, or into the top-level `specs/` folder (repo root,
see [`specs/README.md`](../../specs/README.md)) if they require changes in
more than one package. `e2e/` is a special case: its own `specs/` is the
live `.flow.json` test suite, not a design-docs folder, so even an
e2e-only spec goes to the top-level `specs/` instead of `e2e/specs/`.
`implementation-planner` then reads that spec file as
one of its grounding sources, the same way it reads
`AGENTS.md`/`INSIGHTS.md`, reviews it critically (unclear points become
clarifying questions, gaps become recommendations), but never produces or
edits a spec itself — that stays `spec-creator`'s job exclusively. The split
is deliberate: `spec-creator` answers **what and why** (goals, acceptance
criteria, edge cases); `implementation-planner` answers **how and in what
sequence** (files, order, skills, tests) — and cites the spec's `AC-N`
acceptance criteria on every plan step, so a step traces back to a specific
criterion rather than to the task description alone. `plan-verifier` closes
that loop at the other end: as the final read-only gate before
`architecture-reviewer`/`doc-writer`, it doesn't just re-check the plan's
own file/test claims, it independently re-derives whether every `AC-N` in
the spec actually got covered by verified work, rather than trusting the
plan's self-reported `## AC coverage` table.

`researcher` is independent and can be invoked any time a question needs
grounded evidence rather than a code change — including, now, as
`spec-creator`'s way of getting information it cannot gather itself.
`spec-creator` has no `Bash`, `WebFetch`, `WebSearch`, or `Agent` tool, so
when writing a spec turns up a question those would answer (how a
third-party API behaves, a changelog, a multi-file trace too large for one
pass), it states the question in chat instead of guessing or skipping it.
The **parent session** — never `spec-creator` itself, which like every
agent here has no `Agent` tool — runs one `researcher` invocation per
independent question, in parallel when the questions don't depend on each
other, and feeds the findings back so `spec-creator` can finish the draft.
`implementation-planner` and `implementer` are designed as a pair: the
implementation-planner produces a Development Plan document and always asks
the user to choose between the full multi-agent pipeline and a
single-agent pass before handing off; the implementer consumes exactly that
plan document and executes it. `test-writer`
slots in right after `implementer`, the same way `researcher` is optional —
only needed when coverage is actually missing — and can also run standalone
to backfill tests for existing, unplanned code. `plan-verifier` and
`architecture-reviewer` both consume the Implementation Report but check
different things (concrete fact-checking vs. architectural judgment) and
don't depend on each other's output, so they can run in either order or in
parallel. `doc-writer` runs last, after any fixes from review are applied,
since docs should describe the final shipped state. None of the eight
performs security review — that still happens separately (e.g. the
`security-review` skill).

## Agent summary

| Agent | Responsibility | Tools (permissions) | Model | Input | Output |
|---|---|---|---|---|---|
| [spec-creator.md](spec-creator.md) | Turn a feature/design description into a structured Spec-Driven-Development spec, run before planning starts. Works through six clarification categories (scope & boundaries, actors & permissions, behavior & triggers, data & provenance, non-functional constraints, integration & trust boundaries) instead of guessing, and analyzes the design for missing elements, uncovered edge cases, cross-module interactions, and UX improvements — that analysis also decides placement, and can produce a Mermaid diagram for a non-obvious cross-module flow or state-driven criterion. Create-only — writes exactly one new file, into a single package's own `specs/` folder if the spec's goals stay within that package, or into the top-level `specs/` folder if they require changes in more than one package (always the case for `e2e/`, whose own `specs/` is the flow-test suite, not design docs); never edits an existing file or source code. Read-only devdigest-mcp access (`list_agents`, `get_findings`, `get_conventions`, `get_blast_radius` — never `run_agent_on_pr`) for grounding against live system state on a repo/PR-scoped spec. Has no way to research beyond this repo's own files/system state — flags a question in chat for the parent session to run through `researcher` instead of guessing. | `Read, Grep, Glob, Write, Skill` (`Skill` limited to `mermaid-diagram`), + 4 read-only `mcp__devdigest__*` tools | `sonnet` | A feature/design description (+ target package if not obvious) | A **spec file** (`<package>/specs/SPEC-NN-*.md` or top-level `specs/SPEC-NN-*.md`: Problem, Goals/Non-goals, User stories, EARS acceptance criteria, Edge cases, Design analysis, Non-functional, Inputs/provenance, Untrusted inputs, NEEDS CLARIFICATION) |
| [implementation-planner.md](implementation-planner.md) | Turn a task description into a structured, groundable Development Plan for a non-trivial/multi-file/cross-package change. Reviews any existing spec/requirements, flags unclear points as clarifying questions, and offers recommendations for improving them — but never writes or edits a spec itself. When a spec exists, every plan step cites the `AC-N` id(s) it works toward, and an `## AC coverage` section maps each acceptance criterion to its covering step(s). Always asks the user to choose between the multi-agent pipeline and a single-agent pass before handoff. Read-only — never edits code or specs, invokes Skills, or runs commands. | `Read, Grep, Glob` | `sonnet` | A task/feature/fix description (+ spec, if one exists) | A **Development Plan** (task, requirements review, packages touched, architectural constraints with sources, ordered steps with file paths + AC-N reference + applicable skill per step, AC coverage, test plan, risks, out-of-scope, execution-mode question, open questions) |
| [implementer.md](implementer.md) | Execute an approved Development Plan across `client/`, `server/`, `reviewer-core/`, `e2e/`. Applies the skill each plan step names, edits code, runs the affected package's test/typecheck suite, and checks its own diff stays within the plan's scope. | `Read, Grep, Glob, Edit, Write, Bash, Skill` | `sonnet` | A Development Plan (from `implementation-planner`, or explicit confirmation none is needed) | An **Implementation Report** (files changed, skills applied, commands run + pass/fail, self-verification, explicit "not covered" section flagging that review still needs to run) |
| [researcher.md](researcher.md) | Answer a specific, evidence-backed question — repo research (code/docs/git history) and/or external research (docs, changelogs, web) — without writing or editing anything. Refuses to invoke `/deep-research`. | `Read, Grep, Glob, Bash, WebFetch, WebSearch` | `sonnet` | A specific, scoped question (asks clarifying questions first if the request is ambiguous or open-ended) | A **research report** (Question, Conclusions, Evidence with citations, References, Could-not-find) |
| [test-writer.md](test-writer.md) | Write/extend UI, backend, engine, and e2e-flow tests for a completed change, following each package's real test conventions. Restricted to test files only — never edits production source, reports a bug instead of fixing it — and runs the real test command to report actual pass/fail. | `Read, Grep, Glob, Write, Edit, Bash, Skill` | `sonnet` | An Implementation Report, or a feature/bug description needing coverage | A **Test Report** (files written, skills applied, scenarios & why, commands run + pass/fail, source bugs found but not fixed) |
| [architecture-reviewer.md](architecture-reviewer.md) | Read-only review of a given file list/scope against `onion-architecture` (server/reviewer-core) and `frontend-architecture` + `next-best-practices` (client) layering rules. Evidence-cited findings only, no fixes. | `Read, Grep, Glob` | `sonnet` | A file list/scope (e.g. from an Implementation Report) | A severity-graded **Findings report** (file:line evidence, documented exceptions checked, no fixes) |
| [plan-verifier.md](plan-verifier.md) | The **final read-only gate**: verifies a completed implementation against every item and Test plan command in a Development Plan (re-running the plan's own test commands for real rather than trusting self-reported pass/fail), and — when the plan cites a spec — independently re-derives whether every `AC-N` acceptance criterion is actually covered by verified work, not just listed in the plan's own AC coverage table. Does not judge code quality, architecture, or fix anything. | `Read, Grep, Glob, Bash` | `sonnet` | A Development Plan (+ optional Implementation Report, + the spec it cites) | A **Verification Report** (per-step VERIFIED/NOT DONE/PARTIAL, test-plan pass/fail, constraint compliance, AC-N coverage COVERED/NOT COVERED, overall verdict) |
| [doc-writer.md](doc-writer.md) | Converts a shipped feature/plan/report into documentation in the correct `docs/` location, updating that location's index/table and adding Mermaid diagrams via the `mermaid-diagram` skill. Never writes to `specs/` (pre-implementation territory) or touches source code. | `Read, Grep, Glob, Write, Edit, Skill` | `sonnet` | Development Plan / Implementation Report / feature description | Written/updated docs + index updates + diagrams |

## Preloaded skills

Preloading is scoped to what each agent actually needs — it is **not** a
repo-wide rule that every code-touching agent gets the full set:

- **spec-creator** preloads the same full engineering skill set as
  **implementation-planner**, for the same reason: judging whether a
  described design fits this repo's architectural conventions (onion
  layering, frontend structure, schema/contract patterns) before anything is
  written down as a spec. That preloaded set is awareness-only, same as
  `implementation-planner`. Unlike `implementation-planner`, `spec-creator`
  does have a (narrow) `Skill` tool grant: it may invoke `mermaid-diagram` —
  and only that skill — to embed a sequence/state diagram in a spec, the
  same on-demand pattern `doc-writer` uses for that skill.
- **implementation-planner** and **implementer** preload the same full set of
  engineering skills for awareness/application: `frontend-architecture`,
  `react-best-practices`, `next-best-practices`, `react-testing-library`,
  `fastify-best-practices`, `drizzle-orm-patterns`, `onion-architecture`,
  `postgresql-table-design`, `zod`, `typescript-expert`, `security`.
  - **implementation-planner** reads this content to decide which skill
    applies to each plan step and to avoid planning something a skill's
    rules would conflict with. It cannot invoke a skill (no `Skill` tool).
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

## MCP tool access

Only **spec-creator** has any `mcp__devdigest__*` tool grant, and it's
deliberately the read-only subset of the 5 tools `mcp-server/` exposes (see
[mcp-server/AGENTS.md](../../mcp-server/AGENTS.md) § "The 5 tools"):
`list_agents`, `get_findings`, `get_conventions`, `get_blast_radius`. It
never gets `run_agent_on_pr` — the one tool with a side effect, since it
triggers a real LLM review run — which has no legitimate use while writing a
spec. No other agent here has any devdigest-mcp access; a plan or
implementation step that needs live system state goes through the regular
`@devdigest/api` code paths those agents already read, not through this MCP
server.

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
  dead ends, and workarounds from past sessions. "Affected" is a real filter,
  not a formality: `spec-creator` and `implementation-planner` scope this to
  the package(s) the task actually touches, never a blanket read of every
  package's `INSIGHTS.md`.
- **`TESTING.md`** — test strategy and suite map, used by `test-writer` and
  `plan-verifier` to sanity-check test commands and coverage philosophy.
- **Each package's `docs/README.md` and `specs/README.md`, plus the
  top-level `specs/README.md`**, plus root `README.md`'s "Deeper docs"
  table — used by `doc-writer` to place new documentation correctly and keep
  it discoverable, and by `spec-creator` to decide single- vs. multi-module
  placement, find the next free `SPEC-NN` in whichever folder applies, and
  avoid duplicating an existing spec.
- **The preloaded skills** listed above (scoped per agent), plus
  `.claude/skills/*/SKILL.md` for anything outside that preloaded set.

`implementation-planner` cites these sources per constraint in its
Development Plan output (`<constraint> — <source: AGENTS.md / INSIGHTS.md /
skill name, with path>`).
`implementer` follows the plan's citations rather than re-deriving them, but
still applies the repo-wide conventions directly from `CLAUDE.md` (vendored
contracts, migrations, do-not-touch) as a standing checklist during
execution. `test-writer`, `plan-verifier`, and `doc-writer` each re-derive
the subset of these conventions relevant to their own role directly from the
same sources, rather than trusting a prior agent's report.

## Notes

- None of these agents has the `Agent` tool — they cannot spawn further
  subagents (including each other or review agents). Chaining
  researcher (fan-out, as needed) → spec-creator → implementation-planner →
  implementer → test-writer → plan-verifier / architecture-reviewer →
  doc-writer is done by the parent session, not by the agents themselves —
  including running several `researcher` invocations in parallel when
  `spec-creator` (or anyone else) has more than one independent question.
- Architectural and security review are explicitly out of scope for
  `implementation-planner`, `implementer`, `researcher`, `test-writer`,
  `plan-verifier`, and `doc-writer` — each of their output formats has an
  "Out of scope" / "Not covered" section calling this out so the review step
  isn't skipped. `architecture-reviewer` performs architectural review but
  not security review; security review still happens separately (e.g. the
  `security-review` skill).
- Writing or editing a spec is explicitly out of scope for
  `implementation-planner` too — its "Out of scope" section calls this out,
  and its "Requirements review" section only ever recommends changes to a
  spec, never makes them; that stays `spec-creator`'s job exclusively.
- `architecture-reviewer` and `plan-verifier` are both read-mostly by design
  (no `Write`/`Edit`) so they can never "fix" what they're supposed to be
  checking — findings only, evidence-cited, deferred to a human or to
  `implementer` to act on.
- `spec-creator` has `Write` but no `Edit` and no `Bash`, by design — it can
  only ever create a brand-new file, never modify an existing one (including
  its own prior specs) or run a shell command. It's also the only agent
  restricted to a small, fixed set of destination folders: a single
  package's own `specs/` (never `e2e/specs/` — that's the flow-test suite,
  not design docs), or the top-level `specs/` for a spec whose own goals
  require changes across more than one package (or any spec scoped to
  `e2e/`). It must state the resolved path (and, for a top-level spec, why
  it's multi-module) before writing, and must never write source code,
  docs, or a spec into the wrong folder. Its `Skill` grant is likewise
  narrowed in its own prompt to `mermaid-diagram` only. It also has no
  `Bash`/`WebFetch`/`WebSearch`, so beyond this repo's own files and its 4
  read-only devdigest-mcp tools (see "MCP tool access" above), it cannot
  investigate anything on its own — see the pipeline note above on how it
  hands a research question to the parent session to run through
  `researcher` instead of guessing.
- The `AC-N` traceability chain is enforced at both ends, not just declared:
  `implementation-planner` cites a spec's `AC-N` on every step and lists
  each one's covering step(s) in `## AC coverage`, but that table is its own
  self-report. `plan-verifier` doesn't take it on faith — it re-derives
  coverage independently from the spec and the actual verified diff, and an
  `AC-N` the plan calls covered by a step that turns out NOT DONE/PARTIAL is
  reported NOT COVERED regardless of what the plan claimed.
