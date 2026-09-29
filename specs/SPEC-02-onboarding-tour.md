# Spec: Onboarding Tour  |  Spec ID: SPEC-02  |  Status: ready
Supersedes: none

## Проблема й навіщо
A developer opening an unfamiliar repository has no guided way in: DevDigest already indexes every imported repo (symbols, import graph, file rank, repo map) but only uses that index inside PR reviews. This spec adds an "Onboarding Tour" page per repo that turns the existing index into a five-part, grounded tour (architecture overview, critical paths, how to run locally, guided reading path, first tasks). The scaffolding for it is already half-present in the repo but unused (`onboarding` table, `Onboarding` contract, `feature_models` entry `onboarding`, `onboarding.system.md` prompt, `shell.json` nav label, `repoIntel.getTopFilesByRank` / `getCriticalPaths`, marked "onboarding reading-path" in `repo-intel/README.md`). This spec fills that gap and reshapes the stale parts to match the approved UI mockups.

## Goals / Non-goals
- Goals:
  - A sidebar item "Onboarding Tour" (WORKSPACE group, between Pull Requests and Project Context) opening `/repos/:repoId/tour`.
  - Page "Onboarding for <repo>", subtitle "Generated from index of N files · last refreshed Xh ago", header buttons Regenerate and Share link, left "On this page" anchor nav, five collapsible section cards.
  - Section content: (1) Architecture overview (prose with inline file refs + node/edge diagram, nodes color-coded by kind); (2) Critical paths (file path, short description, Open button); (3) How to run locally (numbered commands, per-command copy button, inline comments); (4) Guided reading path (ordered files, one-line reason each); (5) First tasks (3-5 small, scoped tasks grounded in real files).
  - Generation by an LLM over repo-intel data as grounded context, on demand (first visit or Regenerate); one current tour per repo stored in Postgres with a `generated_at` timestamp.
  - Every file path in the persisted output exists in the repo's clone; hallucinated paths are validated away before persisting.
  - Share link copies the local deep link of the page.
- Non-goals:
  - Public hosting, auth-gated sharing or exporting the tour (local-first).
  - Tour history/versions, diffing two tours, per-user progress tracking ("mark as read").
  - Editing tour content by hand.
  - Executing any generated command (copy only).
  - Auto-regeneration on re-index or on a schedule.
  - Any change to `reviewer-core` (generation uses the existing server LLM port `container.llm(...).completeStructured`, as `conventions` does). See Design analysis.
  - Changing the existing `/onboarding` add-repository screen.

## User stories
- As a new contributor to a repo imported into DevDigest, I want a five-part tour of that repo, so that I can find my way around in my first hour.
- As a new contributor, I want copyable, runnable setup commands, so that I can get the project running locally without reading every doc.
- As a new contributor, I want a small list of scoped starter tasks grounded in real files, so that I know where I can contribute first.
- As a workspace user, I want to Regenerate the tour when the repo has changed, so that it stays current.
- As a workspace user, I want a Share link that copies the page URL, so that I can send a teammate on the same DevDigest instance straight to a section.
- As a security-minded maintainer, I want repo content treated as untrusted data during generation and generated commands never executed, so that a poisoned README cannot steer the LLM or the user's machine.

## Acceptance criteria (EARS)
Navigation and page shell (client)
- AC-1: The sidebar shall list "Onboarding Tour" in the WORKSPACE group between "Pull Requests" and "Project Context", linking to `/repos/:repoId/tour`, highlighted when the pathname is that route (`activeKeyFor` must be changed to map `/repos/:repoId/tour` to `onboarding-tour` and stop matching the add-repo `/onboarding` screen).
- AC-2: WHEN the page loads for a repo with a stored tour, the system shall render the title "Onboarding for <repo full_name>", the subtitle "Generated from index of N files · last refreshed Xh ago" (N = `index_files` snapshot stored in the tour, X = relative time since `generated_at`), the Regenerate and Share link buttons, an "On this page" nav listing exactly the five sections in order, and five section cards.
- AC-3: WHEN the user clicks an "On this page" entry, the system shall scroll to that section, update the URL hash to the section id (`architecture`, `critical-paths`, `run-locally`, `reading-path`, `first-tasks`) and expand the section if collapsed; WHEN the page loads with such a hash, the same section shall be scrolled to and expanded.
- AC-4: WHEN the user toggles a section card header, the system shall collapse/expand only that card (all expanded by default; state is not persisted). The header shall be a button with `aria-expanded`.
- AC-5: IF the repo id in the URL does not resolve to a repo in the workspace, THEN the page shall render the existing `RepoNotFound` state.

Generation and persistence (server)
- AC-6: `GET /repos/:id/onboarding` shall return the repo's current tour (`sections`, `generated_at`, `index_files`, `version`), or a `null` body with 200 when none exists yet; 404 when the repo is not in the caller's workspace.
- AC-7: WHEN `POST /repos/:id/onboarding/generate` is called, the system shall (a) gather grounding facts from repo-intel (repo map, top files by rank, critical paths, per-file caller/endpoint counts via `getBlastRadius`, index state) and from key repo files read from the clone (README, manifest scripts, `.env.example`, compose/Makefile, TODO/FIXME occurrences, files without a sibling test), (b) call the workspace's `onboarding` feature model (`resolveFeatureModel`) via `completeStructured` with a Zod schema, (c) validate the result (AC-9 to AC-14), and (d) upsert the single `onboarding` row for the repo with a fresh `generated_at`, returning the tour with 201.
- AC-8: The system shall keep exactly one current tour per repo (`onboarding.repo_id` is the primary key); IF generation fails at any step, THEN the previously stored tour shall remain unchanged and the endpoint shall return an error (no partial write).
- AC-9: The system shall drop, before persisting, any `path` field (critical paths, reading path, first-task files, diagram node files) that is absolute, contains `..`, or does not resolve (after realpath) to an existing file inside the repo clone.
- AC-10: WHEN a prose `body` contains an inline-code token that looks like a repo path (contains `/` or a known source extension) and does not exist in the clone, the system shall strip the code formatting from that token (keep the text) rather than link it; existing paths shall be preserved as inline code with a file reference.
- AC-11: The How-to-run section shall persist each step as `{ command, comment? }` where `command` is a single line (no `\n`/`\r`/other control characters, at most 300 chars). IF a proposed command contains a newline or control character, THEN the system shall drop that step. IF a step is `npm|pnpm|yarn run <script>`, THEN the script shall exist in the nearest manifest, otherwise the step is dropped. IF a proposed command contains a shell metacharacter (`|`, backtick, `$(`, `>`, `<`, single `&`), THEN the system shall drop the step.
- AC-12: The diagram shall be persisted as structured `nodes[{ id, label, kind, file? }]` and `edges[{ from, to, label? }]` (not as free-form Mermaid), with `kind` from a fixed enum (`client`, `server`, `middleware`, `datastore`, `external`, `api`, `other`), at most 12 nodes; edges referencing an unknown node id and nodes with an invalid `file` are dropped.
- AC-13: The First tasks section shall contain 3-5 tasks, each `{ title, description, files[] }` with at least one validated existing file; tasks left with zero valid files are dropped. IF fewer than 3 survive, THEN the survivors shall still be persisted and the section shall render them.
- AC-14: The Critical paths section shall be seeded by deterministic repo-intel data (`getCriticalPaths` / `getTopFilesByRank`); the LLM may only write the short description for each row and the caller-count text shall come from repo-intel data, never from model output.
- AC-15: IF the repo has no clone on disk, THEN generation shall fail with reason `no_clone` (mirrors Project Context); IF repo-intel is disabled or the index is unavailable (`getIndexState` degraded/failed, or `REPO_INTEL_ENABLED=false`), THEN generation shall fail with reason `index_unavailable`; IF the LLM provider has no key or errors after retries, THEN it shall fail with reason `llm_unavailable`. All map to a non-5xx-for-expected-cases error body with a machine-readable `reason` (exact status codes: implementer picks from existing `platform/errors.ts` mapping) and the UI shall show a specific message per reason.
- AC-16: WHILE a generation for a repo is in progress, a second `POST .../generate` for the same repo shall not start a second LLM call; it shall return 409 (decided: single synchronous request, no background job; UI shows a spinner).
- AC-17: IF the stored `json` fails `Onboarding.safeParse` (unknown `version`, corrupted), THEN `GET` shall treat it as "no tour" (`null`) and log a warning, not return a 5xx.

Sections rendering (client)
- AC-18: Architecture overview shall render the prose as Markdown (raw HTML disabled), inline path tokens as code chips, and the diagram as an SVG/HTML graph laid out from `nodes`/`edges`, node fill determined by `kind`, with a legend and a text alternative (an ordered list of edges) for screen readers.
- AC-19: Critical paths shall render one row per item with the file path, the description, an "N callers" hint when repo-intel provided one, and an "Open" button that opens the file on GitHub at the repo's default branch in a new tab (`rel="noopener noreferrer"`); no new endpoint.
- AC-20: How to run locally shall render numbered steps; each step shows the command with its `comment` (if any) styled as an inline shell comment, and a copy button. WHEN the copy button is clicked, the system shall write only `command` (without the comment) to the clipboard and show a transient "Copied" state announced via `aria-live="polite"`.
- AC-21: Guided reading path shall render an ordered numbered list of files, each with its one-line reason.
- AC-22: First tasks shall render 3-5 task cards with title, description and clickable file chips.
- AC-23: IF a section has no valid items after validation, THEN its card shall render an explicit empty state ("Nothing could be verified for this section") instead of being hidden, and the anchor nav entry shall remain.

Regenerate, Share, first visit
- AC-24: WHEN the user clicks Regenerate, the system shall call the generate endpoint, show a progress/disabled state on the button and cards while pending, and replace the rendered tour on success; on failure the previous tour shall remain visible with an error banner carrying the reason message.
- AC-25: WHEN the user clicks Share link, the system shall copy the current page's absolute URL (origin + `/repos/:repoId/tour` + current hash) to the clipboard and show "Link copied"; IF the clipboard API is unavailable or rejects, THEN it shall show the URL in a selectable field instead.
- AC-26: WHEN the page loads and `GET` returns `null`, the system shall show an empty state with a single "Generate onboarding tour" call to action (no automatic LLM call on page load); the Regenerate button shall not be shown until a tour exists.

Contract and safety invariants
- AC-27: The `Onboarding` contract shall be replaced by the new structured shape (with `version`) identically in `server/src/vendor/shared/contracts/knowledge.ts` and `client/src/vendor/shared/contracts/knowledge.ts`, and the existing contract test (`server/test/contracts.test.ts`, "Onboarding") shall be updated in the same change.
- AC-28: The system shall never execute a generated command, and shall never render tour text as HTML.

Generation flow
```mermaid
sequenceDiagram
  participant UI as client (/repos/:id/onboarding)
  participant API as server (onboarding module)
  participant RI as repoIntel facade
  participant FS as repo clone (on disk)
  participant LLM as container.llm (feature model onboarding)
  participant DB as Postgres onboarding table
  UI->>API: POST /repos/:id/onboarding/generate
  API->>RI: getIndexState, getRepoMap, getTopFilesByRank, getCriticalPaths, getBlastRadius
  API->>FS: getFileContents (README, manifest, .env.example, TODO scan)
  API->>LLM: completeStructured (facts wrapped as untrusted)
  LLM-->>API: draft tour
  API->>FS: validate every path / script (drop hallucinations)
  alt validation or LLM failure
    API-->>UI: error reason, previous tour untouched
  else ok
    API->>DB: upsert (repo_id, json, generated_at)
    API-->>UI: 201 tour
  end
```

## Edge cases
- Repo imported but not yet indexed / index `partial` or `degraded` — generation refused with `index_unavailable` (decided: refuse, no degraded tour).
- Monorepo or repo with several manifests — run-locally commands may cite subpackage paths; script existence is checked against the nearest manifest to the command's `cd`/`--filter` target, else dropped.
- Repo with no README / no manifest / no `.env.example` — How to run shows the empty state (AC-23), never invented commands.
- Repo where the same file is both a critical path and first in the reading path — allowed; sections are independent.
- Very large repos — grounding input is truncated by a fixed token budget; the tour must not fail because the repo map is large.
- A path containing characters that could break Markdown or anchors — rendered as code text, never interpolated into HTML or a URL without encoding.
- Deep link with unknown hash — page renders normally, no scroll, no error.
- Repo removed while the page is open — `GET`/`POST` return 404 and the page shows `RepoNotFound`; the `onboarding` row cascades on repo delete (`onDelete: cascade`).
- Clone advanced (e.g. `resync`) between generation and viewing — the tour is a snapshot; it may reference files that later disappear. Rendering must not crash when the Open action targets a missing file.
- Model returns fewer than five sections or an unknown `kind` — schema-validation failure counts as generation failure (`completeStructured` retries, then AC-8 applies).

## Design analysis
- Missing elements:
  - The stored/legacy `Onboarding` contract (`sections[{kind,title,body,diagram(mermaid),links}]`) cannot express critical-path rows, run steps, an ordered reading path, first tasks or a node/edge diagram; `server/src/prompts/onboarding.system.md` describes a different set of sections (`architecture`, `routes_and_apis`, mermaid diagrams) and `client/messages/en/onboarding.json` describes yet another ("overview, architecture, key modules, getting started, conventions & gotchas"). All three must be rewritten to the five approved sections. Nothing else reads or writes the `onboarding` table today (no `modules/onboarding`), so there is no data-migration concern; a `version` field guards future changes.
  - There is no `modules/onboarding` on the server and no `repos/[repoId]/onboarding` route on the client; the nav item does not exist in `client/src/vendor/ui/nav.ts` (WORKSPACE currently has only `pulls` and `context`) although the `shell.json` label and `activeKeyFor` mapping already exist.
  - The mockup's "Open" button has no defined target (no in-app source viewer exists; the Project Context preview endpoint only serves `.md`).
  - Loading/progress feedback for a multi-second LLM call is unspecified (single request vs job + SSE).
  - "last refreshed" is ambiguous between the tour's `generated_at` and the index's `updatedAt`; this spec uses `generated_at` and snapshots `index_files` (a live file count would drift from the tour content).
- Uncovered edge cases (compared with existing patterns):
  - `zsh` does not treat `#` as a comment in interactive shells by default, so copying `cp .env.example .env # add keys` verbatim can pass `#` and words as arguments. Hence AC-11/AC-20 store the comment separately and copy only the command.
  - A multi-line clipboard payload executes on paste in most terminals; AC-11 rejects control characters.
  - Blast radius has a documented limitation (`viaSymbol` matched by name only, `repo-intel/types.ts`), so "used by N routes" counts can over-merge same-named symbols; the UI must word it as an approximate hint ("N callers"), and prefer file-level distinct-caller-file counts.
  - `getTopFilesByRank` and `getCriticalPaths` return `[]` when `REPO_INTEL_ENABLED=false` (confirmed in `repo-intel/service.ts`); this is why AC-15 has an `index_unavailable` path instead of a silent empty tour.
  - Conventions' evidence check runs after the LLM call, before persistence (`ConventionsService.verifyEvidence`); the same order is used here (AC-9), which also keeps an invalid LLM answer from ever overwriting a good stored tour (AC-8).
- Cross-module interactions:
  - `server/`: new `modules/onboarding/{routes,service,repository,helpers,constants}.ts`, registered in `modules/index.ts`; reads via `container.repoIntel` (`getRepoMap`, `getTopFilesByRank`, `getCriticalPaths`, `getBlastRadius`, `getFileContents`, `getIndexState`) and `container.llm` with `resolveFeatureModel(..., 'onboarding')`; prompt via `platform/prompts.ts` `renderPrompt('onboarding.system.md', ...)`; untrusted wrapping via the `platform/prompt.ts` shim over `reviewer-core` `wrapUntrusted`. The `onboarding` table exists in `db/schema/context.ts` (`repo_id` PK, `json`, `generated_at`); no new table and (per current design) no migration.
  - `client/`: new route `src/app/repos/[repoId]/onboarding/` with `_components/`, new hook `src/lib/hooks/onboarding.ts` (TanStack Query, through `src/lib/api.ts`), i18n `messages/en/onboarding.json` rewritten, NAV entry in `src/vendor/ui/nav.ts` (a vendored-UI edit, a deliberate one-off change per `client` conventions), optional `g`-shortcut.
  - Shared contract: `Onboarding` in `knowledge.ts` hand-edited in both vendored copies (drift risk noted in root `CLAUDE.md`). `platform.ts` `FEATURE_MODELS` already has `onboarding` in both copies, so Settings → Feature Models needs no change.
  - `reviewer-core/`: no change (the `grounding.ts` comment already names onboarding as a full-file scanner exception, irrelevant here because this is not a review finding).
  - Route collision: `/onboarding` is already the add-repository screen (`client/src/app/onboarding`, e2e `06-onboarding.flow.json`). The new page is repo-scoped (`/repos/:repoId/tour`), so no route conflict, but naming is confusing and `activeKeyFor` matches `pathname.includes("/onboarding")`, which today already highlights "Onboarding Tour" while on the add-repo screen. Decided: route is `/repos/:repoId/tour` and `activeKeyFor` is fixed as part of this spec.
  - Comparable features: Project Context (`docs/project-context.md`) for `no_clone`/untrusted-text handling and page layout; Conventions for the synchronous LLM + verify-then-persist pattern and `POST .../extract` route shape.
- UX improvements (out of scope, worth flagging):
  - Stale banner when the repo's `lastIndexedSha` differs from the SHA the tour was generated at.
  - Confirm dialog on Regenerate (it overwrites the only copy).
  - Per-section scroll-spy highlight in "On this page".
  - "Copy all commands" button and per-step "requires" hints (e.g. Docker).
  - A `g o` navigation shortcut and a command-palette entry.
  - Link First-tasks cards to "create a branch" or an issue draft.

## Non-functional
- Performance: `GET` is a single primary-key read (target p95 < 200 ms). Generation is LLM-bound; server-side timeout and input-token budget are constants in `modules/onboarding/constants.ts` (values TBD by implementer; single synchronous request per decision). Path validation reads only existing clone files.
- Security: see Untrusted inputs. Output is stored as data and rendered as Markdown with raw HTML disabled; no `dangerouslySetInnerHTML`. Workspace scoping is enforced by resolving the repo through the workspace (`getContext` + `RepoRepository.getById(workspaceId, repoId)`), because the `onboarding` table has no `workspace_id`.
- Accessibility: collapsible headers are buttons with `aria-expanded`; "On this page" is a labelled `nav`; copy/share feedback uses `aria-live="polite"`; icon-only buttons have `aria-label`; diagram has a text alternative (AC-18); node colors are not the only carrier of meaning (label + kind legend).
- Reliability: no partial writes (AC-8); one in-flight generation per repo (AC-16); corrupted stored JSON degrades to the empty state (AC-17).
- i18n: all new strings in `client/messages/en/onboarding.json` (next-intl); generated content language follows the existing `{{language}}` prompt variable.
- Tests: server unit tests for pure validation helpers (path/script/command/diagram sanitizers); a `*.it.test.ts` integration test for generate/get/upsert with a mocked LLM (`adapters/mocks.ts`); client RTL tests for section rendering, copy behavior, empty and error states. A new e2e flow is a follow-up (the existing `06-onboarding.flow.json` covers only the add-repo screen).

## Inputs (provenance)
- Repo id, workspace: URL param `:repoId`; workspace via `getContext` [reused: `modules/_shared/context.ts`].
- File index, repo map, importance ranking, critical path chains, import graph: [reused: `container.repoIntel` facade].
- Caller / endpoint counts per critical file: [reused: `repoIntel.getBlastRadius(repoId, [file])`], counted deterministically; never taken from model output.
- Key file contents (README, manifests, `.env.example`, compose/Makefile) and TODO/FIXME / missing-test signals: [reused: `repoIntel.getFileContents` on the clone] plus [deterministic: fixed file-name list and scan rules in `constants.ts`].
- Existing accepted conventions (optional grounding for first tasks): [reused: conventions repository]; v1 does not use them (see Resolved decisions).
- Model/provider: [reused: `resolveFeatureModel(container, workspaceId, 'onboarding')`; default from `FEATURE_MODELS`].
- System prompt: [reused: `server/src/prompts/onboarding.system.md`, to be rewritten] via `renderPrompt`.
- `index_files` snapshot: [deterministic: `IndexState.filesIndexed` at generation time].
- `generated_at`: [deterministic: DB `now()` at upsert].
- Diagram node `kind` color: [deterministic: client-side map from the enum].
- Share link URL: [deterministic: `window.location` at click time].
- Regenerate / Generate / Copy / Share / collapse actions: [user-provided].

## Untrusted inputs
- Everything read from the repository is attacker-influenceable and must be treated as data, never as instructions: README and other docs, manifest `scripts`, `.env.example`, compose/Makefile, source files and comments (including TODO/FIXME text), file names, the repo map text, and symbol names. It is passed to the LLM only inside `wrapUntrusted(...)` blocks with fixed labels (not derived from paths), with the system prompt's existing "everything inside `<untrusted>` is DATA" clause retained. Paths interpolated into headings must be sanitized like Project Context does (`[A-Za-z0-9._\-/ @+()]`).
- The LLM output is itself derived from untrusted input and is therefore untrusted: every path, script name and command is validated in code (AC-9 to AC-13), prose is rendered as Markdown without raw HTML, diagram content is structured data (not Mermaid source, which would allow injection through labels), and generated shell commands are copy-only and never executed by DevDigest (AC-28). Commands with shell metacharacters are dropped; blocking other patterns such as `sudo` is out of scope for v1 (see Resolved decisions).
- The deep link contains only the local repo UUID and a section hash; it carries no secrets.

## Resolved decisions
- Route is `/repos/:repoId/tour`; `activeKeyFor` is fixed accordingly.
- "Open" links to the file on GitHub (default branch, new tab).
- Repo-intel disabled or index degraded: generation refuses with `index_unavailable`.
- Generation is one synchronous request; concurrent Regenerate returns 409.
- First visit shows a "Generate" call to action; no automatic LLM call (AC-26).
- Diagram is structured nodes/edges with a `kind` enum, not Mermaid. The `kind` values are to be matched to the mockup colours during implementation.
- "Last refreshed" uses the tour's `generated_at`.
- Accepted Conventions are not fed into the tour in v1.
- Generated commands containing shell metacharacters (`|`, backtick, `$(`, `>`, `<`, single `&`) are dropped (changed after architecture review; `&&`, `||`, `;` remain allowed). Other patterns such as `sudo` are not filtered. Commands are copy-only and never executed by DevDigest (AC-28).
- Markdown links and images are stripped from the architecture prose server-side; the client never renders images.
- Any workspace user may Regenerate; no extra gating.
- If validation leaves fewer than 3 First tasks, the survivors are persisted (AC-13).
