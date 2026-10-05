# specs

Top-level, cross-module design docs — proposed changes, RFCs, and
course-lesson feature specs whose scope genuinely spans more than one
package (e.g. a feature that changes both `server/` and `client/`, or a
vendored `@devdigest/shared` contract shared across packages), written
before implementation.

This folder holds **only** specs that affect multiple modules. A spec
scoped to a single package belongs in that package's own `specs/` folder
instead — `server/specs/`, `client/specs/`, `reviewer-core/specs/`,
`mcp-server/specs/` — even if it happens to read from or call another
package's existing, unchanged code. What decides the placement is whether
the spec's own goals/acceptance criteria require changes in more than one
package, not whether the feature touches another package at runtime.

**Exception: `e2e/`.** `e2e/specs/` is not a design-docs folder — it's the
live `NN-name.flow.json` flow-test suite executed by `run.ts` in CI, and
must not hold markdown specs. A spec scoped only to `e2e/` still belongs
here, in the top-level folder, not in `e2e/specs/`.

Once a spec ships, either delete it or mark it done at the top so it
doesn't silently drift from the code.
