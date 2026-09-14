# reviewer-core — `@devdigest/reviewer-core`

Pure review engine: diff → prompt → LLM → grounded findings. No DB, GitHub,
or filesystem — the only side effect is an LLM call through an injected
`LLMProvider`. Full picture (pipeline diagram, public API): [README.md](README.md).

## Stack

TypeScript only, `zod` for schemas, an `openai`-shaped client (used against
OpenRouter). Consumed by `server/` via a tsconfig path alias
(`@devdigest/reviewer-core` → `src`), not a built package — `build` is just a
type-check, no JS is ever emitted.

## Run / test

- `npm test` (vitest) — hermetic, stubbed `LLMProvider`, no keys/network
- `npm run typecheck` (doubles as the build)

## Map

- `src/review/` — orchestration (`run.ts`, `reduce`)
- `src/llm/` — `LLMProvider` port + OpenRouter implementation, structured-output parsing
- `src/output/` — grounding gate (`groundFindings`) and scoring
- `src/index.ts` — the public API surface; everything else is internal

## Non-default conventions

- Grounding is mandatory and mechanical: a finding that doesn't cite a real
  diff line is dropped, and the score is recomputed from the survivors — the
  model's self-reported score/findings are never trusted directly.
- Prompt-injection defense is one shared, trusted rule (`INJECTION_GUARD`)
  appended to every system prompt, not keyword/text scanning — untrusted
  diff/PR content is always framed as data, never instructions.
- Optional prompt slots (`skills`, `memory`, `specs`, `callers`) exist for
  later course lessons; when a caller omits one, `assemblePrompt` just leaves
  the section out — don't add fallback/default text for an omitted slot.

## Gotchas

- Contracts (`Review`, `Finding`, `Verdict`, …) come from `@devdigest/shared`,
  not defined locally — check there before adding a type that might already
  exist.

## Deeper docs — use when

| File | Use when |
|---|---|
| [README.md](README.md) | you need the pipeline diagram or full public-API list — not for routine edits |
| [docs/](docs/) | investigating a past design decision or internal flow not covered above |
| [specs/](specs/) | planning or reviewing an in-flight feature for this package |
| [INSIGHTS.md](INSIGHTS.md) | you hit a surprising bug or behavior here — check whether it's already explained |
