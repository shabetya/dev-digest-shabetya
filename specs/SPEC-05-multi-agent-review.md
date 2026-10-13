# Spec: Multi-Agent Review  |  Spec ID: SPEC-05  |  Status: ready for planning
Supersedes: none

## Проблема й навіщо

Today a PR can only be reviewed by "all enabled agents" or exactly one agent
(`RunReviewDropdown` → `POST /pulls/:id/review` with `{all:true}` or
`{agentId}`), and results from several agents land as separate accordion
entries in the Findings tab with no grouping, no cross-agent comparison, and
no cost/time visibility before you commit to a run. A reviewer who wants
"Security + Performance, but not the other three" has no way to express that,
and nobody can see where two agents actually disagree about the same code
without manually diffing their write-ups. Multi-Agent Review adds: (1) a
subset-of-agents picker with historical cost/time estimates, (2) a durable
grouping of one run-click's fanned-out agent runs, (3) a results view that
puts agents side-by-side and surfaces where they agree/disagree on the same
file:line, while reusing the parallel-execution and trace/log machinery that
already exists.

## Goals / Non-goals

- **Goals:**
  - Replace the PR page's `RunReviewDropdown` with a checkbox multi-select
    ("Pick agents to run") showing a per-agent time estimate and a primary
    "Run multi-agent review (N)" button.
  - Add a standalone **Configure run** page (PR picker → agent-card
    multi-select with per-agent time+cost estimate and a "Select all" link →
    bottom bar with total estimate and the run button).
  - Extend the existing run-request contract so a caller can pass an
    **explicit subset of agent IDs**, not just "all" or "exactly one" — this
    is new scope on top of the REUSE claim in the source material (see
    Design analysis).
  - Persist a `multi_agent_runs` row per "Run multi-agent review" click and
    link the `agent_runs` rows it fanned out to it, with a single combined
    read endpoint to fetch "all runs + disagreements under this multi-run."
    **Correction (see Clarifications #7):** `multi_agent_runs` is not a new
    table — it has existed, unwired, since `server/src/db/migrations/
    0000_init.sql`. This spec wires it up and extends it (new
    `target_agents` snapshot column, new `agent_runs.multi_agent_run_id`
    FK), it does not create it from scratch.
  - Compute per-agent and total **cost/time estimates** from historical
    `agent_runs` data (new mechanic — no estimate UI exists today — but see
    Clarifications #7: the response shape adapts an already-scaffolded
    vendored contract rather than inventing a parallel one where one fits).
  - Build a deterministic cross-agent location-matching rule (same file +
    overlapping line range) and a "Where agents disagree" view built on it,
    preserving each agent's original finding/attribution. **Correction:**
    the matching *logic* is new (no clustering/dedupe code existed anywhere
    in `server/src`/`reviewer-core/src`), but the vendored
    `Conflict`/`ConflictTake` response shape it populates already exists in
    `observability.ts` — see Clarifications #7.
  - Build the Multi-Agent Review **results page** (Columns and Tabs+detail
    view modes), reusing the existing Run Trace / Live Log primitives
    unchanged.
  - Wire "Turn into eval case" to the existing eval-pipeline entry point
    (confirmed present — see Design analysis). Wire "Learn" as a UI-only stub
    with no backend persistence.
- **Non-goals:**
  - A full Memory feature behind "Learn" — out of scope, separate homework.
    Confirmed: "Learn" stays a pure client-side stub (AC-21) with zero
    backend call or persisted signal — no Memory-bootstrapping endpoint in
    this spec.
  - Semantic/"meaning" similarity for cross-agent grouping beyond the
    deterministic file+line-overlap rule — confirmed as the v1 scope (see
    AC-16/18); a follow-up spec would own adding semantic similarity.
  - The "Reply to author" button shown in one screenshot but absent from the
    text requirements — confirmed excluded from this spec's acceptance
    criteria; would need its own GitHub-write-path spec.
  - Per-Agent Stats (explicitly deferred by the source material).
  - Any change to `server/ci/` or `agent-runner/` (including hand-editing
    `agent-runner/dist/`) — out of bounds per the stated worktree/scope
    boundary and the root `CLAUDE.md` do-not-touch list.
  - Any change to the `RunTraceDrawer` / `LiveLogStream` components' own
    internals — they are reused as-is (see Design analysis for the one
    structural move they do need: promotion out of a route-private folder).
  - The existing "Compose Review" drawer concept named in the source
    material — out of scope regardless, and in any case I could not locate a
    component under that name anywhere in `client/src` today (grepped
    `Compose Review`, `ComposeReview`, `Composer`, `publish`/`Publish` under
    `app/repos`); flagged in Design analysis rather than assumed.

## User stories

- As a reviewer on a PR page, I want to pick exactly the agents I care about
  and see roughly how long/what it'll cost before I run them, so that I don't
  wait on agents I don't need.
- As a reviewer setting up a review from scratch, I want a dedicated
  Configure-run page where I pick a PR and then the agents, so that I can
  plan a multi-agent run outside the pressure of an already-open PR page.
- As a reviewer reading results, I want agents laid out side-by-side (or as
  tabs) so I can compare verdicts without opening five separate accordions.
- As a reviewer, I want a single panel that shows me every spot where agents
  disagree (including "agent X did not flag this"), so I can resolve
  conflicting advice quickly instead of hunting for it.
- As a reviewer looking at one agent's finding, I want to accept/dismiss it,
  mark it for future Memory ("Learn"), or promote it into the eval suite,
  without leaving the results page.

## Acceptance criteria (EARS)

**Picker (PR page)**

- AC-1: WHEN the PR page's agent picker is opened, the system shall list every
  configured agent as a checkbox with a per-agent time estimate (e.g. "~6s"),
  a "Select all" control, and a primary button labelled "Run multi-agent
  review (N)" where N is the current checked count.
- AC-2: WHILE zero agents are checked, the system shall disable the "Run
  multi-agent review" button.
- AC-3: WHEN the user clicks "Run multi-agent review (N)" with N≥1 agents
  checked, the system shall POST the chosen agent IDs and navigate to the
  Multi-Agent Review results page for the run it creates.

**Configure run page**

- AC-3b: WHEN the PR page's agent picker is open, the system shall show a
  "Configure run…" item distinct from the existing "Configure agents…" item
  (which stays pointed at `/agents`) that navigates to the standalone
  Configure Run page.
- AC-4: WHEN the Configure Run page loads with no PR pre-selected, the system
  shall show step 1 (a PR-picker dropdown) and keep step 2 (agent cards)
  disabled until a PR is chosen.
- AC-5: WHEN a PR is chosen in step 1, the system shall render one agent card
  per configured agent in step 2, each showing icon, name, a one-line
  description or last-finding summary, and a per-agent time+cost estimate
  (e.g. "8.2s · $0.06").
- AC-6: WHEN the user clicks "Select all" in step 2, the system shall check
  every agent card and update the bottom bar's total estimate accordingly.
- AC-7: WHILE at least one agent card is checked, the bottom bar shall show
  "Run multi-agent review (N)" plus a combined estimate line (e.g. "≈ 8.2s ·
  $0.20 · parallel fan-out"), where the combined time is the **maximum**
  per-agent estimate (agents run in parallel) and the combined cost is the
  **sum** of per-agent estimates.

**Run request / fan-out (server)**

- AC-8: WHEN `POST /pulls/:id/review` is called with an explicit `agentIds`
  array (new third mode, alongside the existing `all` and `agentId` modes),
  the system shall resolve targets to exactly those agents (by workspace-scoped
  lookup) and run them, each in its own isolated per-agent execution,
  reusing the existing `ReviewRunExecutor.executeRuns` fan-out unchanged.
- AC-9: IF a run request supplies more than one of `agentId`, `all`, and
  `agentIds`, THEN the system shall reject it with 400 `invalid_run_request`
  (ambiguous request) rather than silently picking one.
- AC-10: IF `agentIds` contains an ID that does not resolve to an agent in the
  caller's workspace, THEN the system shall reject the whole request with 404
  `agent_not_found` rather than silently running the subset that did resolve.
- AC-11: WHEN a run request includes 2+ agent IDs (whether via `agentIds` or
  the existing `all`), the system shall create exactly one `multi_agent_runs`
  row for that click and tag every `agent_runs` row it creates with that
  multi-run's id.
- AC-12: Ubiquitous — a single `GET /multi-agent-runs/:id` endpoint shall
  return one combined payload (adapting the existing vendored `MultiAgentRun`
  contract shape — see Clarifications #7): the multi-run's id, PR reference,
  every `agent_runs` row tagged with it as `columns` (id, agent, status,
  score, cost, duration — including an "agent run deleted" placeholder row
  per the `target_agents` snapshot when an underlying `agent_runs` row was
  individually deleted, see Edge cases), and the disagreement `conflicts`
  (AC-16/17/18) in the same response — not two separate round-trips — so the
  results page survives a reload the same way `/pulls/:id/runs` already does
  for the single-PR timeline.

**Results page**

- AC-13: WHILE a multi-run's agent runs are still in flight, the Columns view
  shall show one column per agent with a live status ring (0-100 score once
  known, colour-coded) and update as each agent's findings stream in — not
  only after all agents finish.
- AC-14: WHEN the user toggles to Tabs+detail mode, the system shall show one
  tab per agent (name + numeric score badge) and, for the selected tab's
  findings, a detail view with severity icon, title, category, file:line,
  confidence %, body, suggested fix, and Accept/Dismiss/Learn/"Turn into eval
  case" actions.
- AC-15: WHEN the user clicks "View trace" / the logs toggle on any column or
  tab, the system shall open the existing `RunTraceDrawer` (promoted to
  shared — see Design analysis) scoped to that specific `agent_run`'s id,
  passing its `runId`, `agentName`, and `running` state exactly as the
  PR-page's own run-status area does today. The drawer's existing Trace tab
  (Configuration / Stats / Prompt assembly / Tool calls / Raw output, via
  `TraceBody`), its Live-log tab (SSE via `useRunEvents` while the run is
  in flight), and its "Copy raw output" footer action are all reused
  unchanged — this spec adds no new drawer content or tabs, only new call
  sites (one per column/tab) that each open it scoped to a different
  `agent_run`.
- AC-15b: WHILE an agent's run is still in flight, that agent's
  column/tab "View trace" action shall open the drawer defaulted to the
  Live-log tab (same `running` behavior as the existing PR-page drawer);
  once that agent's run completes, subsequent opens default to the Trace
  tab.
- AC-16: WHILE 2 or more agents are in the multi-run, the system shall show a
  "Where agents disagree" panel with one block per distinct code location
  (file + overlapping line range), listing every selected agent's verdict at
  that location — using the vendored `Conflict`/`ConflictTake` shape's
  `'ignored'` verdict literal (see Clarifications #7) for an explicit
  "did not flag" entry for an agent that raised nothing there.
- AC-17: IF exactly one agent is in the multi-run, THEN the combined
  AC-12 response's `conflicts` field shall be empty/omitted and the client
  shall render no "Where agents disagree" panel (nothing to compare) —
  computed server-side rather than filtered client-side.
- AC-18: WHEN the user enables "Show only conflicts," the system shall filter
  the disagreement panel to locations where at least one agent's verdict
  differs from another's (including a "flagged vs. did-not-flag" split),
  hiding locations where every agent agrees.

**Finding actions**

- AC-19: WHEN the user clicks Accept or Dismiss on a finding in the results
  page, the system shall call the existing `POST /findings/:id/accept|dismiss`
  action, unchanged.
- AC-20: WHEN the user clicks "Turn into eval case," the system shall call the
  existing `POST /findings/:id/eval-case` endpoint (confirmed present —
  `docs/eval-pipeline.md`), not a new one.
- AC-21: WHEN the user clicks "Learn," the system shall show a "coming soon —
  part of the Memory feature" acknowledgement and perform no network call or
  persistence (stub only).

**Estimates**

- AC-22: Ubiquitous — the per-agent time/cost estimate shown in the picker and
  Configure Run page shall be computed at query time from that agent's 10
  most recent completed (`status='done'`) `agent_runs` rows (median
  duration/cost, workspace-scoped, no time cutoff), never from a stored
  static field on `agents`.
- AC-23: IF an agent has zero completed historical runs, THEN its card/row
  shall show "no history yet" instead of a number, and it shall be excluded
  from the combined total estimate.

## Edge cases

- Zero agents configured in the workspace — Configure Run page's step 2 shows
  an empty state with a link to create an agent, same affordance already
  used by the picker ("No agents yet — create one").
- Two "Run multi-agent review" clicks on the same PR in quick succession —
  each creates its own independent `multi_agent_runs` row; nothing
  deduplicates concurrent runs (matches today's behavior for repeated single
  runs).
- An `agent_runs` row belonging to a multi-run is individually deleted later
  via the existing `DELETE /runs/:id` (which hard-deletes the row — the
  nullable-on-delete FK alone cannot resolve this, since nothing on the
  `agent_runs` side survives to be nulled). Resolved via `multi_agent_runs.
  target_agents`, a jsonb snapshot of `{agent_id, agent_name}[]` taken at
  creation time (see Clarifications #8): the AC-12 detail endpoint diffs
  this snapshot against the `agent_runs` rows still tagged with the
  multi-run's id, and renders any agent present in the snapshot but missing
  from the live rows as a "run deleted" placeholder column/tab rather than
  silently omitting it or erroring.
- A disagreement location whose file was renamed/moved between two agents'
  (identical) diff view — out of scope; both agents review the same frozen
  diff, so this cannot occur within one multi-run.
- An agent fails/errors mid-run — its column/tab shows the failure (reusing
  the existing failed-run presentation), and it is treated as "did not flag
  anything" (not "agrees") in the disagreement panel, since it produced no
  grounded findings to compare.
- The PR picker's dropdown (Configure Run step 1) is opened for a repo with
  zero PRs imported — standard empty state, not a new concept.
- A user navigates directly to `/multi-agent-review/:multiRunId` for a
  multi-run that doesn't exist or belongs to another workspace — 404,
  workspace-scoped lookup (same pattern as every other `getContext`-gated
  route).

## Design analysis

- **Missing elements:**
  - The source material never specifies what happens when a run request's
    `agentIds` partially fails to resolve (AC-10 above resolves this: all-or-
    nothing, matching the existing single-`agentId` 404 behavior rather than
    silently dropping unknown IDs).
  - No error/empty state was specified for the Configure Run page when the
    chosen PR itself has zero changed files or the diff fails to load —
    existing `/pulls/:id/review` already handles this (fails all queued runs
    via `failAll` in `run-executor.ts`); the results page needs to render
    that failed state per column, which isn't itself new but wasn't called
    out.
  - Exact navigation entry point for the **Configure Run** page from the PR
    page is underspecified by the mockups as described: the picker's own
    "Configure agents…" link already exists today and points at `/agents`
    (manage agent definitions — confirmed in `RunReviewDropdown.tsx:81`). The
    Configure Run wizard needs its *own* distinct affordance/link text so it
    isn't confused with that existing link — flagged in NEEDS CLARIFICATION.
  - The exact "recent N runs" window for cost/time estimates (AC-22) is not
    stated by the source material. Recommending N=10 most recent `done`
    `agent_runs` for that agent (no time cutoff, workspace-scoped, across all
    PRs) as a reasonable default; flagged for confirmation in NEEDS
    CLARIFICATION rather than blocking the draft.
- **Uncovered edge cases (beyond "Edge cases" above):**
  - `agentsRepo` currently exposes `getById` (single) and `listEnabled`
    (all-enabled) — no batch-by-ids lookup. The new `agentIds` mode needs
    either a new `getByIds(workspaceId, ids)` repository method or a loop of
    `getById` calls; either is fine, but a loop must still enforce
    "all resolve or the whole request 400s" (AC-10), not partial success.
  - `agent_runs.status` can be `'running'|'done'|'failed'|'cancelled'`
    (`db/schema/runs.ts:38`) — the disagreement panel and estimate query must
    both filter to `'done'` explicitly; a naive "all runs for this agent"
    query would pollute estimates with failed/cancelled rows that have
    `durationMs`/`costUsd` of 0 or null.
  - Workspace scoping: every new read (multi-run detail, disagreement
    comparison, estimates) must go through `getContext` → `workspaceId`
    exactly like every existing route in this module — there is no
    workspace-scoping shortcut to take just because the data is "derived."
- **Cross-module interactions:**
  - This spec changes the vendored `@devdigest/shared` `RunRequest` contract
    (`server/src/vendor/shared/contracts/platform.ts:292`, mirrored at
    `client/src/vendor/shared/contracts/platform.ts:292`) to add an optional
    `agentIds: string[]` field — per this repo's own stated convention, that
    is **always** a hand-edit-both-copies change, and is itself sufficient to
    make this spec multi-module even setting aside the UI/route work.
  - **Correction surfaced during planning (see Clarifications #7):** the
    vendored `observability.ts` contract (both `server/src/vendor/shared/
    contracts/observability.ts` and its client mirror) already defines
    `MultiAgentRun`, `AgentColumn`/`AgentColumnFinding`, and
    `Conflict`/`ConflictTake` (headed "L07 — Observability / Multi-agent
    contracts"), unwired to any route — these model most of AC-12/13/14/16/18
    already. This spec adapts/extends those existing shapes for the combined
    AC-12 endpoint rather than defining parallel ones; it adds only a new
    `AgentEstimate` shape (AC-22/23, which nothing existing covers) and
    leaves `AgentStats`/`CuratorResult` untouched (Per-Agent Stats and the
    Memory curator are explicit non-goals).
  - `RunTraceDrawer` currently lives at
    `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/`
    — route-private, one consumer (`PrDetailView`). This spec's results page
    is a genuine second consumer of the same component with the same
    contract (open a trace drawer for one `agent_run` id), which is exactly
    the promotion trigger this repo's `frontend-architecture` conventions
    call for ("promote feature → shared only when a second feature actually
    needs it") — not duplicate it. The plan should move it to a shared
    location (e.g. `client/src/components/run-trace-drawer/`) as part of this
    work, not leave two copies. The results page needs only one mounted
    drawer instance at a time (page-level `selectedRunId` state, cleared on
    close) — each column/tab's "View trace" sets that id rather than each
    column owning its own drawer instance, mirroring how the PR page already
    mounts a single `RunTraceDrawer` for whichever run is selected.
  - The results page route is placed at the top level
    (`client/src/app/multi-agent-review/[multiRunId]/`), not nested under
    `repos/[repoId]/pulls/[number]/`, because a multi-run's id alone is
    enough to resolve the PR via the new detail endpoint, and the Configure
    Run flow's own step 1 (pick *any* PR) implies this is a dashboard-level
    feature, not a PR-page sub-view. This is a judgment call, not dictated by
    the source material — noted explicitly so it can be overturned.
  - Sequence of the new flow, including which pieces are new vs. reused
    unchanged:

    ```mermaid
    sequenceDiagram
      participant C as Client (Configure Run / Picker)
      participant R as Server routes (POST /pulls/:id/review)
      participant S as ReviewService.resolveTargets (extended)
      participant M as MultiAgentRunService (new)
      participant E as ReviewRunExecutor (existing, unchanged)
      participant B as RunBus / SSE (existing, unchanged)
      participant D as RunTraceDrawer (existing, promoted to shared)

      C->>R: POST /pulls/:id/review { agentIds: [...] }
      R->>S: resolveTargets(workspaceId, { agentIds })
      S-->>R: AgentRow[] (selected subset)
      R->>M: createMultiRun(workspaceId, prId, agentIds.length)
      M-->>R: multiRunId
      R->>E: executeRuns(jobs: [{agent, runId}], tagged with multiRunId)
      Note right of E: existing per-agent isolated fan-out — unchanged
      R-->>C: { multiRunId, runs: [{run_id, agent_id, agent_name}] }
      C->>C: navigate to /multi-agent-review/:multiRunId
      C->>M: GET /multi-agent-runs/:multiRunId (combined columns+conflicts)
      M-->>C: MultiAgentRun { columns, conflicts }
      loop per agent_run (parallel)
        E->>B: publish RunEvents (info/tool/result/error)
        C->>B: GET /runs/:id/events (SSE, existing, unchanged)
        B-->>C: live events -> column/tab updates
      end
      C->>D: "View trace" -> open RunTraceDrawer(runId)
    ```

- **UX improvements (flagged, not required by this spec):**
  - Showing a confidence interval (not just a point estimate) for cost/time
    when an agent's history is sparse (<3 runs) would be more honest than a
    bare median.
  - The disagreement panel could let a reviewer jump straight to the diff
    line from a location block (same `?tab=diff&file=&line=` deep link
    pattern already used by PR Brief, per `docs/pr-brief.md`) — not required
    here, but a natural follow-up since the pattern already exists.

## Non-functional

- **Security:** every new/extended endpoint (`multi-agent-runs` detail,
  disagreement comparison, estimates, the extended `/pulls/:id/review`) must
  resolve `workspaceId` via the existing `getContext` pattern before touching
  any row — no new workspace-scoping mechanism, no shortcut for "derived"
  reads.
- **Performance:** the picker's per-agent estimate query must not add
  noticeable latency to opening the dropdown — bound the historical-runs
  query per agent (e.g. `LIMIT 10`) rather than scanning full history; the
  combined estimate for N agents should be computable from N small queries
  run in parallel, not N sequential round-trips.
- **Reliability:** the multi-run detail endpoint must be the server-side
  source of truth for the results page, the same way `/pulls/:id/runs` and
  `/pulls/:id/runs/active` already are for the single-PR timeline — a page
  reload during an in-flight multi-run must reconstruct the same Columns/Tabs
  view from that endpoint plus live SSE, not from client-only state.

## Inputs (provenance)

- Agent list + descriptions on picker/Configure Run cards —
  [reused: existing `GET /agents`, already used by `useAgents()`].
- PR list for Configure Run step 1 — [reused: existing PR listing
  endpoint/hook for the chosen repo].
- Per-agent time/cost estimate — [deterministic: median of that agent's
  recent `status='done'` `agent_runs.durationMs`/`costUsd`, new query].
- `multiRunId` — [deterministic: server-generated UUID, new
  `multi_agent_runs.id`].
- Agent IDs in a run request — [user-provided: picker/Configure Run
  checkbox selections].
- Per-finding severity/title/body/suggested fix shown in the results page —
  [reused: existing grounded `Review`/finding records persisted by
  `run-executor.ts`, unchanged generation path].
- "Where agents disagree" location blocks — [deterministic: new file+line-
  overlap rule applied to each agent's already-persisted grounded findings
  for this multi-run — no new LLM call].
- "Learn" acknowledgement — [deterministic: static client-side copy, no
  data].

## Untrusted inputs

- Finding titles, bodies, suggested fixes, and categories surfaced on the
  results page originate from LLM output already grounded against the PR
  diff by the existing pipeline (`reviewer-core`'s citation gate) — this
  spec adds no new path for that content to reach the UI and does not change
  how it is generated. It must continue to be rendered as data (already the
  case via `FindingCard`/`RunTraceDrawer`), never as instructions.
- The PR diff and PR description behind every finding remain author-
  controlled, untrusted text, already wrapped by the existing
  `<untrusted source="…">` convention (`docs/agent-prompts/README.md`) before
  it ever reaches a model. This spec does not add a new ingestion path for
  PR content.
- The new cross-agent grouping rule (file + line-range overlap) is a purely
  deterministic, structural comparison over already-grounded finding records
  — it does not re-read PR text and does not call an LLM, so it introduces
  no new untrusted-input surface.

## Clarifications (resolved)

All nine open questions below were raised during drafting and planning and
have since been confirmed by the user; none remain open. Kept here (rather
than deleted) as the decision record. Items 1–6 surfaced while drafting this
spec; items 7–9 surfaced during `implementation-planner`'s pass and are
folded back in here so the spec stays the accurate source of truth rather
than drifting from what the plan actually implements.

1. **Configure Run entry point** — confirmed: add a distinct "Configure
   run…" item in the PR-page picker, alongside the existing "Configure
   agents…" item (which stays pointed at `/agents`). Captured as AC-3b.
2. **Cross-agent similarity scope for v1** — confirmed: file + overlapping
   line-range only (deterministic, no LLM/embeddings call). Semantic
   similarity is explicitly deferred to a future follow-up spec, not part of
   this one. Captured in Goals/Non-goals and AC-16/18.
3. **"Reply to author"** — confirmed excluded from this spec. Would need its
   own GitHub-write-path spec if pursued later.
4. **Historical-runs window for estimates (AC-22)** — confirmed: 10 most
   recent `status='done'` `agent_runs` per agent, workspace-scoped, no time
   cutoff.
5. **`multi_agent_runs` ↔ `agent_runs` FK design** — confirmed: nullable
   `agent_runs.multi_agent_run_id` column (indexed, `onDelete: 'set null'`),
   not a join table.
6. **"Learn" backend signal** — confirmed: pure client-side stub, zero
   network call or persisted signal in this spec (AC-21).
7. **Pre-existing scaffolding (`multi_agent_runs` table + vendored
   `observability.ts` contracts)** — `implementation-planner` found that
   `multi_agent_runs` has existed, unwired, since `0000_init.sql` (not a new
   table as originally framed), and that the vendored `observability.ts`
   contract already defines `MultiAgentRun`/`AgentColumn`/
   `AgentColumnFinding`/`Conflict`/`ConflictTake` shapes covering most of
   AC-12/13/14/16/18. Confirmed: adapt/extend these existing shapes rather
   than defining parallel ones (no separate spec-creator re-pass). See Goals
   and Design analysis corrections above.
8. **"Run deleted" edge case mechanism** — confirmed: add a
   `multi_agent_runs.target_agents` jsonb snapshot column
   (`{agent_id, agent_name}[]`, populated at creation), since the confirmed
   nullable-FK design (#5) alone can't distinguish "this agent's run was
   deleted" from "this agent was never part of the run" once `DELETE
   /runs/:id` hard-deletes the row. See Edge cases.
9. **AC-12 endpoint shape** — confirmed: one combined `GET
   /multi-agent-runs/:id` endpoint returning `{columns, conflicts}` together
   (matching the scaffolded `MultiAgentRun` contract — see #7), not two
   separate detail/conflicts endpoints — one round-trip for the results
   page. See AC-12/16/17.
