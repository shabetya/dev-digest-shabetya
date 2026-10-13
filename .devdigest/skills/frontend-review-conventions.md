# frontend-review-conventions

# Frontend review conventions
Apply these rules only to changed frontend files (React/Next.js components,
hooks, client-side TypeScript — files under a `client/`, `components/`, or
`app/` directory, or ending in `.tsx`).

- Flag any data fetch made directly with `fetch()` inside a component instead
  of going through the project's data hook layer.
- Flag a new component whose state/props are managed with more than a couple of
  independent `useState` calls where a single `useReducer` would be clearer.
- Flag a list rendered without a stable, unique `key` (array index used as key
  on a list that can reorder or filter).
- Flag a component that swallows a loading or error state from a query hook
  instead of rendering it (blank screen on error/loading is a real UX bug).
- Do not flag purely stylistic preferences that don't affect behaviour.