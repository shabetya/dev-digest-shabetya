# Frontend UI Architecture

**Version:** 1.0.0 · **Status:** active · **Last updated:** 2026-09-17

Sourced justification for [SKILL.md](SKILL.md). Full research notes, exact
quotes, and per-source verification are in [SOURCES.md](SOURCES.md); this
file is the aggregated, skimmable version.

## What this skill is for

Structural and code-organization decisions in a React + Next.js (App Router)
codebase: where a file or component should live, when and how to split a
component, where business logic belongs relative to components/hooks/plain
functions, where constants/utils/types/config belong, how the API/data-access
layer should be shaped, and where Server Actions and data fetching belong in
the App Router. It answers "where does this go / how should this be split /
what layer owns this responsibility" — not "how do I use `useEffect`
correctly" or "how does Next.js caching work."

## Target use cases

Use this skill when someone:
- Is adding a new feature/route and asking how to lay out its files
- Isn't sure whether some logic belongs in a component, a custom hook, or a
  plain `.ts` function
- Is deciding whether/how to split a component that's grown large or
  tangled
- Is asking where a constant, a helper function, a shared type, or an env
  variable should live
- Is structuring the client-side API layer (fetchers, query hooks, DTO
  mapping)
- Is deciding where a Server Action, a data-fetch, or a `'use client'`
  boundary should sit in the App Router
- Is reviewing a PR and flagging that something is in the wrong place, or
  that a `utils.ts` has become a dumping ground

## Scope: what this skill does *not* cover

This skill deliberately stays out of two neighboring skills' territory so all
three stay useful without overlapping:

| Skill | Owns |
|---|---|
| `react-best-practices` | Hook mechanics, state patterns, memoization, rendering/performance anti-patterns — the *how*, once you know *where* code lives |
| `next-best-practices` | RSC boundary mechanics, file-convention primitives (`page`/`layout`/`loading`/etc.), caching internals, bundling |
| **`frontend-architecture`** (this skill) | *Where* files, components, logic, and config live; *how* to split and layer them |

If a question is really "is this a good use of `useMemo`" or "why is my
route not revalidating," redirect to those skills instead of duplicating
their content here.

## How this skill was built

Compiled from a targeted research pass across ~30 sources: official docs
(react.dev, the TypeScript Handbook, Next.js's own guides), primary
maintainer writing (Kent C. Dodds, Dan Abramov, Sandi Metz, TkDodo), and
widely-adopted community reference architectures (bulletproof-react,
Feature-Sliced Design, Josh Comeau, Robin Wieruch). Every claim in
[SKILL.md](SKILL.md) traces back to one or more sources below — see
[SOURCES.md](SOURCES.md) for the exact quotes and per-source notes, including
which sources are canon/official vs. practitioner-authored and where
respected sources genuinely disagree.

## References

### Folder structure & colocation
- [Colocation — Kent C. Dodds](https://kentcdodds.com/blog/colocation)
- [State Colocation will make your React app faster — Kent C. Dodds](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster)
- [bulletproof-react — Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- [React Folder Structure Best Practices — Robin Wieruch](https://www.robinwieruch.de/react-folder-structure/)
- [Delightful React File/Directory Structure — Josh W. Comeau](https://www.joshwcomeau.com/react/file-structure/) *(dissents from feature folders and from the anti-barrel-file consensus — see Known Judgment Calls in SKILL.md)*
- [Feature-Sliced Design — official docs](https://feature-sliced.design/docs/get-started/overview)

### Component splitting & composition
- [When to break up a component into multiple components — Kent C. Dodds](https://kentcdodds.com/blog/when-to-break-up-a-component-into-multiple-components)
- [The Wrong Abstraction — Sandi Metz](https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction)
- [AHA Programming — Kent C. Dodds](https://kentcdodds.com/blog/aha-programming)
- [Presentational and Container Components (with self-added retraction) — Dan Abramov](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0)
- react.dev — *Thinking in React* (component-hierarchy breakdown; re-verify the canonical `react.dev/learn/thinking-in-react` URL before quoting directly)

### Business logic placement
- [Reusing Logic with Custom Hooks — react.dev (official)](https://react.dev/learn/reusing-logic-with-custom-hooks)
- [You Might Not Need an Effect — react.dev (official)](https://react.dev/learn/you-might-not-need-an-effect)
- [Separation of concerns with React hooks — Felix Gerschau](https://felixgerschau.com/react-hooks-separation-of-concerns/)
- [React Query as a State Manager — TkDodo](https://tkdodo.eu/blog/react-query-as-a-state-manager)
- [Deriving Client State from Server State — TkDodo](https://tkdodo.eu/blog/deriving-client-state-from-server-state)
- [Application State Management with React — Kent C. Dodds](https://kentcdodds.com/blog/application-state-management-with-react)

### Constants, utils, types, config
- [How to Add a Constants File to Your React Project — Austin Paley](https://medium.com/@austinpaley32/how-to-add-a-constants-file-to-your-react-project-6ce31c015774)
- [Where Should You Declare Constants in React? — Tom Zhang](https://tomzhangdev.substack.com/p/where-should-you-declare-constants)
- [Helper, Utility, Factory… or Something More Sinister? (the "utility sink")](https://dev.to/duplessisvanaswegen/helper-utility-factory-or-something-more-sinister-426e)
- [Dunghill Anti-Pattern — Matti Lehtinen](https://mattilehtinen.com/articles/dunghill-anti-pattern-why-utility-classes-and-modules-smell/)
- [TypeScript Handbook — Enums](https://www.typescriptlang.org/docs/handbook/enums.html)
- [T3 Env — introduction](https://env.t3.gg/docs/introduction)
- [Environment Variables — Create T3 App](https://create.t3.gg/en/usage/env-variables)

### Barrel files & import-boundary enforcement
- [Barrel Files: Why index.ts Re-Exports Hurt Tree Shaking, Next.js Dev Memory, and tsc (2026)](https://medium.com/@wul55267/barrel-files-why-index-ts-re-exports-hurt-tree-shaking-next-js-dev-memory-and-tsc-2026-005a27a14689)
- [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries)

### Next.js App Router architecture
- [Getting Started: Project Structure — Next.js official docs](https://nextjs.org/docs/app/getting-started/project-structure)
- [Guides: Data Security (Data Access Layer) — Next.js official docs](https://nextjs.org/docs/app/guides/data-security)
- [Guides: Server Actions — Next.js official docs](https://nextjs.org/docs/app/guides/server-actions)
- Getting Started: Server and Client Components — Next.js official docs (`nextjs.org/docs/app/getting-started/server-and-client-components`)

*(The full list, including secondary/corroborating sources and per-source
verification notes, is in [SOURCES.md](SOURCES.md).)*

## Relationship to this repo's other architecture docs

Same idea as a backend architecture skill would apply to `server/`: name the
layers already implicit in the codebase, cite why each rule holds, and
describe drift rather than pretend it isn't there. See
[SKILL.md § This Repo (`client/`)](SKILL.md#this-repo-client) for how these
rules map onto `client/src/app`, `client/src/components`, `client/src/lib`,
and `client/src/vendor`.

## Version history

- **1.0.0** (2026-09-17) — Initial version. Covers folder structure,
  component splitting, business logic placement, constants/utils/types/config,
  import-boundary enforcement, and Next.js App Router architecture (added
  after the initial research pass, at the user's request, since the existing
  `next-best-practices` skill covers RSC *mechanics* but not *where things
  live*).
