# Worked examples

## Example 1 — UI-only diff

Pending changes touch only:

```
client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx
client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.test.tsx
client/src/app/agents/_components/AgentCard/AgentCard.tsx
```

Routing result:

| Skill | Matched files | Ran? |
|---|---|---|
| `frontend-architecture` | all 3 | yes |
| `react-best-practices` | `AgentEditor.tsx`, `AgentCard.tsx` | yes |
| `react-testing-library` | `AgentEditor.test.tsx` | yes |
| `next-best-practices` | none (no `app/**` route file or `next.config.*` matched beyond the component itself*) | skipped |
| `typescript-expert` | all 3 (`.tsx`) | yes |
| `security` | `client/**` matched (forms/XSS surface) | yes |
| `fastify-best-practices`, `onion-architecture`, `drizzle-orm-patterns`, `postgresql-table-design`, `zod` | none | skipped |

\* In practice `client/src/app/**` is a broad glob and would also match
`next-best-practices` here — this example intentionally shows a case where a
component sits under `app/` but changes nothing route-level (no page, layout,
loading, or data-fetching change), so `next-best-practices` finds nothing
report-worthy even though it technically matched and ran.

Report shape: no CRITICAL or HIGH findings, one MEDIUM from
`react-best-practices` about a missing `useCallback` on a handler passed to a
memoized child, zero findings from the rest. Gate: not blocked, PR can be
opened; the MEDIUM is reported for the author's judgment.

## Example 2 — Mixed client + server diff, blocked

Pending changes touch:

```
server/src/modules/reviews/routes.ts
server/src/modules/reviews/service.ts
server/src/db/schema.ts
client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx
```

Routing result: `fastify-best-practices` and `onion-architecture` run on the
two `server/src/modules/reviews/*` files; `drizzle-orm-patterns`,
`postgresql-table-design`, and `zod` run on `schema.ts`;
`frontend-architecture` and `react-best-practices` run on `FindingCard.tsx`;
`typescript-expert` and `security` run across all four (all `.ts`/`.tsx`,
`server/**` and `client/**` both touched).

`onion-architecture` reports a CRITICAL: `routes.ts` now queries
`db.query.reviews` directly instead of going through `reviewRepo`, which is
this repo's explicitly-flagged violation pattern (`routes.ts` querying the
database directly, regardless of module stage). `drizzle-orm-patterns` also
notes the new `schema.ts` column has no corresponding migration file.

Gate: **blocked.** The report states the PR must not be opened until the
route is routed through `reviewRepo` (or the direct query is deliberately
accepted and dismissed with a reason) and the migration is generated. The
`FindingCard.tsx` findings (if any, non-critical) are still reported below
the blocking summary, not hidden by it.
