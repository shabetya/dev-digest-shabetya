# client — `@devdigest/web`

Next.js 15 studio UI: import repos, browse PRs, run/read AI reviews, author
agents. Full picture (UI route map): [README.md](README.md).

## Stack

Next.js 15 (App Router) · React 19 · TanStack Query (all data access via
`src/lib/hooks/*`) · `next-intl` (`messages/<locale>/*.json`) · `recharts` ·
`mermaid` · `react-markdown`. UI primitives vendored at `src/vendor/ui`
(`@devdigest/ui`), shared contracts at `src/vendor/shared`
(`@devdigest/shared` — see root [AGENTS.md](../AGENTS.md) re: drift).

## Run / test

- `pnpm dev` (`:3000`) · `pnpm build` · `pnpm typecheck`
- `pnpm test` — vitest + jsdom, `fetch` mocked; no API or DB needed

## Map

- `src/app/**/page.tsx` — routes, kept thin
- `src/app/<route>/_components/<Name>/` — colocated feature logic +
  `*.test.tsx`
- `src/components/app-shell` — cross-cutting nav/chrome, `g`-then-key
  shortcuts
- `src/lib/hooks/*` — every server-data access point (TanStack Query)
- `src/lib/api.ts` — the one place that knows `NEXT_PUBLIC_API_BASE`

## Non-default conventions

- All API calls go through `src/lib/api.ts` + a hook in `src/lib/hooks/*` —
  don't `fetch()` directly from a component.
- Feature logic lives colocated under a route's `_components/`, not in a
  global `components/` bucket — `src/components/` is for truly cross-cutting
  chrome only.

## Gotchas

- Component tests mock `fetch` and never hit a real API — real browser
  journeys (client + API + seeded DB together) are only covered by
  [`../e2e`](../e2e/AGENTS.md), not by anything in this package.

## Deeper docs — use when

| File | Use when |
|---|---|
| [README.md](README.md) | you need the full UI route map — not for routine edits |
| [docs/](docs/) | investigating a past design decision or internal flow not covered above |
| [specs/](specs/) | planning or reviewing an in-flight feature for this package |
| [INSIGHTS.md](INSIGHTS.md) | you hit a surprising bug or behavior here — check whether it's already explained, or use the `engineering-insights` skill to append a new one |
