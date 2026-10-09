# onion-architecture evals

- `evals.json` — test cases (prompt, expectations, fixture files); paths are relative to the skill root.
- `fixtures/` — five small backend modules, each with 3 planted architecture problems and no comments hinting at them:
  `bookmarks` (routes query DB / raw rows / ad hoc 404), `notifications` (SDK + env in service / cross-module import),
  `invoices` (no transaction / rule in job callback / `vi.mock` of own repository).

Run each prompt twice (with the skill, and without it as baseline) via skill-creator; keep run outputs, grading and
the viewer outside the skill folder (e.g. `onion-architecture-workspace/`).

`billing` (eval 5) is the larger fixture: six planted problems (P1–P6) plus three legitimate-by-design spots that must
*not* be flagged (`db/seed.ts`, pure code under `adapters/payments/amount.ts`, a routes-only `health` module). Run it
5× per configuration to get a detection rate rather than a single pass/fail.
