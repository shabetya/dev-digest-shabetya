---
name: frontend-architecture
description: "Structural code-organization guidance for React + Next.js App Router apps — where files, components, business logic, constants, utils, types, and config should live; how to split a component; how to structure a feature and its API layer; where Server Actions and data access belong. Use this whenever someone asks where something should go, how to organize a new feature or folder, whether logic belongs in a hook vs. a plain function vs. a component, how big a component should get before splitting it, where a constant or a helper `.ts` file belongs, or how App Router data-fetching/Server Action patterns should be structured — even if they never say the word 'architecture'. Structural/organizational decisions only — hook mechanics, state patterns, memoization and render-performance anti-patterns live in `react-best-practices`; RSC boundary mechanics, file-convention primitives, caching and bundling live in `next-best-practices`."
version: 1.0.0
---

# Frontend UI Architecture

Where code lives and how it is layered in a React + Next.js (App Router) app.
Every rule below is sourced — see [README.md](README.md) for the full citation
list and [SOURCES.md](SOURCES.md) for the raw research.

Sibling skills — this skill does not duplicate their territory:
- `react-best-practices` — hooks rules, state patterns, memoization, rendering anti-patterns
- `next-best-practices` — RSC boundary mechanics, file conventions, async APIs, caching, bundling

## Core Principles

1. **Colocation is the default; sharing is earned.** Put code as close to its
   one consumer as possible. Extract it to a shared location only once a
   *second* consumer genuinely needs it — not because it looks reusable.
2. **The promotion ladder.** Component body → same file → feature-local
   folder → shared layer. Promote on a concrete trigger (a second
   feature/route needs it); demote symmetrically when a "shared" util loses
   all but one caller.
3. **Imports point one way: shared → features → app.** Features import only
   from shared code; the app/route layer composes features; nothing imports
   "upward" or across features — compose at the app/route level instead.
   Enforce this with a lint rule (`import/no-restricted-paths` for a handful
   of layers; `eslint-plugin-boundaries` once there are many named
   feature/entity types), not by convention alone.
4. **Consistency beats the specific choice.** A mediocre structure applied
   uniformly beats a better one applied inconsistently — Next.js's own docs
   say this almost verbatim about file organization.

## Folder Structure

- Structure should **evolve with app size**, not be decided on day one.
  Technical folders (`components/`, `hooks/`, `utils/`) are fine while an app
  is small; move to feature folders once that flat structure stops scaling
  (community convention puts this somewhere in the tens-of-thousands-of-LOC
  or multi-team range — a signal, not a hard number).
- **Shared vs. feature components:** domain-agnostic primitives (buttons,
  modals, design-system pieces) live in a shared UI location; anything that
  references a domain concept stays inside the feature/route that owns it.
  Promote feature → shared only when a second feature actually needs it.
- **One folder per component** for shared components is a reasonable
  default: the component, its subcomponents, its helpers/types, and its test
  live together. Tests sit next to source, not in a mirrored `test/` tree.
- Cap folder nesting at roughly 3–4 levels; prefer an absolute import alias
  (`@/…`) over long relative paths once nesting grows.
- **Barrel files (`index.ts` re-exports): avoid wide ones in application
  code.** They measurably hurt tree-shaking, slow dev-server/typecheck time,
  and are a common source of "cannot access X before initialization"
  circular-dependency bugs. They're legitimate as a *library's* public entry
  point, or as a single-component forwarder — not as a wide re-export barrel
  across a feature. (This is genuinely contested — see Known Judgment Calls.)

## Component Splitting

- **Don't split preemptively.** Split when a concrete problem shows up, not
  before: the component re-renders too much because unrelated state lives
  together, a piece needs reuse elsewhere, the state has become hard to
  follow, you can't test a piece in isolation, or it's a magnet for merge
  conflicts. This is a citable rule, not a vibe — see README.
- **"Duplication is cheaper than the wrong abstraction."** When two pieces of
  code look similar today, wait for a *third*, concrete, unambiguous case
  before extracting a shared abstraction. If an abstraction turns out wrong,
  the fix is to inline it back into its callers and re-abstract from what's
  actually there — not to keep bolting on parameters and conditionals.
- **Composition over configuration.** When a component sprouts boolean or
  variant props, reach for `children`, slots, or a compound-component pattern
  (parent owns state, children consume it via context) instead of adding more
  flags.
- **Container/presentational is not a rule to enforce.** Custom hooks removed
  the only structural reason for a wrapper "container" component. The
  how-it-works/how-it-looks split survives as: logic in a custom hook,
  headless components only when one behavior genuinely needs several visual
  skins.
- A private subcomponent with exactly one parent can stay inside the
  parent's file. Split it out only once it's shared, independently tested, or
  a repeated source of review friction — one-component-per-file is a default,
  not a law.

## Business Logic Placement

Three bands, dependencies pointing inward only:

| Band | Holds | Tested via |
|------|-------|-----------|
| Components | rendering, event wiring | render tests |
| Custom hooks | orchestration: state, effects, query composition | `renderHook` |
| Plain functions/modules | business rules, calculations, validation, mapping | direct unit tests |

- **A function is a hook only if it calls hooks.** This is React's own
  stated rule, not a style preference: a function that calls no hooks should
  not be named `useX` — name it as a plain function so it stays callable
  conditionally and from anywhere, and stays testable without rendering
  anything.
- **`useEffect` is for synchronizing with something outside React** (a
  non-React widget, the network, the DOM) — not a place for business logic.
  The deciding question: is this caused by a specific user interaction (→
  event handler) or by the component merely being on screen (→ effect)? A
  POST request triggered by a button press belongs in the handler, not an
  effect watching state.
- **Components never fetch directly.** Route data access through one typed
  client/config module → per-resource fetchers → a custom hook per resource —
  that hook is the only thing a component touches. Query keys and raw
  fetchers should never appear inside a component.
- **Server state and client state are different things.** A query
  cache/library owns freshness, retries, and invalidation for anything that
  came from the server — don't copy that data into local/global state; tune
  the cache's staleness settings instead. Once server state is properly
  separated, the client state that's left over (theme, open/closed UI flags)
  is usually small.

## Constants, Utils, Types, Config

- **Constants colocate** with the file that uses them by default. A
  dedicated constants file is justified per-feature, or for genuinely
  app-wide values (routes, limits) — never one global dumping file that
  every feature reaches into.
- **Prefer `as const` objects / literal unions over TypeScript `enum`.**
  This matches the TypeScript team's own stated preference: it keeps the
  code aligned with plain JavaScript and avoids the extra runtime object an
  `enum` generates. Never use `const enum` in code that crosses a module
  boundary — it can break under isolated-module transpilation.
- **No grab-bag `utils.ts`.** An undifferentiated utilities file has no
  identity, so unrelated logic keeps flowing into it because that's the path
  of least resistance ("the utility sink"). Name utility modules by domain
  (`format-date.ts`, `currency.ts`); a helper used by one feature lives in
  that feature; delete a utility once its last caller is gone rather than
  let it linger.
- **Types colocate by default**, same as everything else: prop types in the
  component file, feature types in the feature. A shared types location
  holds only genuinely cross-cutting and API-contract types.
- **Env/config: one typed, validated module.** Parse `process.env` through a
  schema (e.g. Zod) once, at startup/build, and have the rest of the app
  import the parsed, typed result — raw `process.env` reads should not
  scatter through the codebase. Secrets in particular should only ever be
  read from that one place.

## Next.js App Router Architecture

Next.js's own docs state that the framework is **deliberately unopinionated**
about file organization — it gives you the primitives (colocation-by-default
inside `app/`, private `_folders` to opt out of routing, route groups for
shared layouts without affecting the URL) and leaves the choice of strategy to
the team, with the explicit advice to pick one and stay consistent.

- **`app/` is a thin routing layer.** A `page.tsx` should read like
  orchestration — import a feature-level component, pass params, return UI.
  The real logic lives in feature/shared code, not in the route file itself.
- **Server components by default; `'use client'` pushed to the leaves.** The
  directive is a one-way door in the module graph — everything a
  client-marked file imports ships to the browser — so where a file sits
  relative to that boundary is an architectural decision, not a style choice.
- **Pick one data-access strategy for the whole app and don't mix it.**
  Next.js names three: an **External HTTP API** (fetch a separate backend —
  the right model when the frontend fronts its own API server), a **Data
  Access Layer** (a `server-only` module that performs authorization and
  returns minimal DTOs — the model for new full-stack Next.js projects
  talking to a DB directly), or **component-level data access** (prototypes
  only — it's the shape most likely to leak private fields to the client by
  accident). Don't "upgrade" an app that legitimately fits the first model
  into DAL ceremony it doesn't need.
- **Server Actions are thin controllers, and they are public endpoints.**
  An action is reachable via a direct POST request regardless of where it's
  called from in the UI — a page-level auth check does **not** protect the
  action. Every action must, on its own: authenticate, authorize (not just
  "is logged in" — "is this user allowed to touch *this* resource"), validate
  its input as untrusted, and return only what the UI needs, never a raw
  record. The action itself should mostly just call into a server-only
  module and then revalidate — auth/authz/DB logic lives in that module, not
  sprinkled across every action.
- **Never derive authorization from a client-submitted object's contents.**
  A client may say *which* resource to act on (an id); it must not supply
  that resource's other fields or its ownership — re-derive both from the
  authenticated session. Schema validation only checks shape, not ownership.

## This Repo (`client/`)

Current shape these rules apply to — describing it, not prescribing a
from-scratch migration:

- **Route-private colocation.** `src/app/<route>/_components/<Name>/` holds
  feature logic colocated with its route, kept out of routing via the
  underscore convention. There is no top-level `features/` folder — routes
  under `src/app/` play that role.
- **Shared vs. feature components.** `src/components/app-shell` (nav/chrome),
  `src/components/diff-viewer/*`, `src/components/mermaid-diagram`,
  `src/components/page-shell`, `src/components/showcase` are the truly
  cross-cutting pieces. `src/components/` is not a dumping ground for
  route-specific UI — that belongs in the route's own `_components/`.
- **API layer.** `src/lib/api.ts` is the one place that knows
  `NEXT_PUBLIC_API_BASE`; `src/lib/hooks/*` is every server-data access point
  (TanStack Query). Components should not `fetch()` directly. This is the
  **External HTTP APIs** case from the Next.js Architecture section above —
  `client/` fronts the separate `server/` API — not a Data-Access-Layer-over-DB
  case, and it shouldn't be "upgraded" into one.
- **Vendored code is canonical-copy territory.** `src/vendor/shared/contracts`
  is a hand-synced copy of `@devdigest/shared` (canonical copy lives in
  `server/src/vendor/shared/`); `src/vendor/ui/*` is the vendored UI kit.
  Don't restructure inside `vendor/` as part of an "architecture cleanup" —
  changes there are a deliberate, separate kind of change.
- **Routes stay thin.** `src/app/**/page.tsx` files are documented as
  deliberately thin — real logic lives in the route's `_components/` or in
  shared code, not in the page file itself.

## Known Judgment Calls

Where good sources genuinely disagree — pick per situation, don't treat
either side as the only correct answer:

- **Feature folders vs. technical/function folders**, especially at scale.
  The community default leans feature-based as an app grows, but this is
  contested by respected voices who find feature boundaries blur over time
  as products change shape.
- **Barrel files.** The 2026 tooling evidence (tree-shaking, dev-server
  memory, circular-dependency hotspots) leans against wide barrels in
  application code, but there's a credible counter-argument that
  author-written barrels are a rounding error against third-party dependency
  weight at real app scale. Cite both; don't pretend it's settled.
- **`lib/` vs. `utils/` vs. `helpers/` vocabulary.** No winner — pick one
  scheme per project and apply it consistently.
- **How much App Router ceremony to adopt.** Next.js presents External HTTP
  APIs, a Data Access Layer, and component-level access as equally valid,
  size/shape-matched strategies, not a maturity ladder — resist "graduating"
  a project that's legitimately the External-HTTP-API case into DAL
  machinery it doesn't need.
- **`import/no-restricted-paths` vs. `eslint-plugin-boundaries`.** A scale
  choice, not a right-answer choice — the simple rule is enough for a
  shared/features/app split; the element-typed plugin earns its complexity
  once a project has many distinct feature/entity/widget types to police.
