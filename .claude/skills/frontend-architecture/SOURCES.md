# Frontend UI Architecture (React + Next.js) — research sources & skill plan

Raw material and the plan for a future `frontend-architecture` skill. Compiled
2026-09-17 from targeted research passes: **A** folder/file organization and
colocation · **B** component splitting and composition · **C** business-logic
placement (hooks vs plain functions, server state vs client state) · **D**
constants/utils/types/config placement · **E** import-boundary enforcement ·
**F** Next.js App Router architecture (where things live, not RSC mechanics).
Every URL below was fetched or returned via search and its claims verified
against the source in this pass (2026-09-17).

Scope note: this skill owns **structural decisions for the frontend** — where
files/components live, how to split a component, where business logic /
constants / utils / types / config belong, how the API layer is structured, and
where Server Actions / data access live in Next.js App Router. It must not
duplicate sibling skills: `react-best-practices` owns hooks mechanics, state
patterns, memoization and render anti-patterns; `next-best-practices` owns RSC
boundary mechanics, file-convention primitives, caching and bundling. This is
the frontend counterpart of the backend's `onion-architecture` skill (see that
skill's own `SOURCES.md` for format/precedent) and should follow the same
two-file shape: `SKILL.md` (rules) + `README.md` (sourced justification).

---

## 1. Folder structure & colocation

### Colocation — Kent C. Dodds (2017, ongoing)
- https://kentcdodds.com/blog/colocation
- Core rule, verbatim: **"Place code as close to where it's relevant as
  possible."** Restated as: things that change together should be located as
  close as reasonable to one another.
- Reasoning: prevents orphaned code (deleting a component without noticing an
  associated helper survives elsewhere), makes purpose/dependencies obvious on
  sight, and removes the context-switching cost of hunting through distant
  "utility" directories.
- Companion: https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster
  — the same principle applied specifically to `useState`/`useReducer` — state
  used by one subtree should live in that subtree, not lifted by default.

### Bulletproof React — project structure — Alan (alan2207) et al.
- https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md
- The most-cited community reference architecture. Top-level `src/`:
  `app/`, `assets/`, `components/` (shared), `config/`, `features/` (primary
  unit), `hooks/` (shared), `lib/`, `stores/`, `testing/`, `types/`, `utils/`.
- Each feature folder *optionally* contains its own `api/`, `assets/`,
  `components/`, `hooks/`, `stores/`, `types/`, `utils/` — explicit
  instruction: **"You don't need all of these folders for every feature."**
- **Import rule, verbatim direction:** unidirectional **shared → features →
  app**. Features must not import other features (compose at the app layer
  instead); shared code may be used by anything; app may import from features
  and shared but nothing imports from app. Recommends enforcing this with
  ESLint's `import/no-restricted-paths`.

### Robin Wieruch — React Folder Structure (2026 guide, annually revised)
- https://www.robinwieruch.de/react-folder-structure/
- Prescribes a **progressive/evolutionary** approach rather than a fixed
  template: start with one file, split into `components/`, `hooks/`, and one
  of `utils/`/`lib/` once it's uncomfortable, and only add `domains/`- or
  `features/`-level folders once the codebase's growth demands it.
- Explicitly frames folder structure as a *5-step evolution* tied to LOC/team
  size, not a day-one architectural commitment — echoes bulletproof-react's
  "colocate first, extract later" but with concrete escalation steps.

### Josh Comeau — Delightful React File/Directory Structure (dissenting view)
- https://www.joshwcomeau.com/react/file-structure/
- **Deliberately organizes by technical role** (`components/`, `hooks/`,
  `helpers/`, `utils/`, `constants/`) rather than by feature, and argues
  against feature folders: *"Real life isn't nicely segmented like this, and
  categorization is actually really hard"* — as products evolve, feature
  boundaries blur and the "right" folder for a file becomes arbitrary.
- One-folder-per-component pattern: component file + companion `index.ts`
  forwarder + subcomponents/helpers/types tucked inside.
- Also the strongest **pro-barrel-file** voice in mainstream React writing
  (see §5) — a genuine, citable disagreement with the anti-barrel consensus.

### Feature-Sliced Design — official docs
- https://feature-sliced.design/docs/get-started/overview
- A fully specified, opinionated methodology: **layers** (top→bottom) `app` →
  `processes` (deprecated) → `pages` → `widgets` → `features` → `entities` →
  `shared`; **slices** (business-domain partitions within a layer — "slices
  cannot use other slices on the same layer"); **segments** (`ui`, `api`,
  `model`, `lib`, `config` — purpose-grouping within a slice).
- **Import rule, verbatim:** "Modules on one layer can only know about and
  import from modules from the layers strictly below." A stricter, formally
  named version of bulletproof-react's shared→features→app direction.
- Useful as the "maximal ceremony" end of the spectrum — cite alongside
  bulletproof-react's lighter-weight version, the way the backend skill cites
  Stemmler's DDD-forum as the maximal end.

### "How to Structure a Scalable React Project" surveys (2026)
- https://www.robinwieruch.de/react-folder-structure/ (already above) and
  general 2026 survey material converge on: **feature-based/vertical-slice
  organization is the mainstream default for apps past a certain size**
  (commonly cited threshold: tens of thousands of LOC or multiple teams);
  technical/horizontal folders (`components/`, `hooks/`, `utils/`) remain
  legitimate for small-to-mid apps. Treat as a size-matched dial, not a rule —
  same shape as the backend skill's Palermo "not for small sites" caveat.

## 2. Component splitting & composition

### Kent C. Dodds — When to Break Up a Component Into Multiple Components
- https://kentcdodds.com/blog/when-to-break-up-a-component-into-multiple-components
- Central rule, verbatim: **"When you experience one of the problems above,
  that's when you break your component into multiple smaller components. NOT
  BEFORE."**
- The seven concrete trigger problems: performance (unrelated state changes
  re-render too much), reuse need, state-tracking complexity, inability to
  test a piece in isolation, team/merge-conflict friction, third-party
  library/HOC incompatibility, and imperative-API/lifecycle clutter.
- Directly cites Sandi Metz's "duplication is far cheaper than the wrong
  abstraction" as the guiding caution against splitting preemptively.

### Sandi Metz — The Wrong Abstraction (2016)
- https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction
- Origin of the RailsConf 2014 line **"duplication is far cheaper than the
  wrong abstraction."** Describes the failure mode precisely: an abstraction
  extracted from duplication looks "almost perfect" for a new requirement, so
  the next engineer bends it with a parameter and a conditional rather than
  questioning it — repeat, and the abstraction rots.
- Prescribed fix: **inline the abstraction back into every caller**, strip
  each caller down to only what it needs, then re-abstract from what's left —
  "the fastest way forward is back." Not React-specific but the canonical
  citation behind "prefer duplication over the wrong abstraction."

### Kent C. Dodds — AHA Programming (Avoid Hasty Abstractions)
- https://kentcdodds.com/blog/aha-programming
- Positions AHA as the middle ground between DRY and WET: don't abstract on
  first duplication; wait for a *concrete, repeated* pattern to emerge, then
  extract. Companion talk: https://gitnation.com/contents/aha-programming
  (React Amsterdam 2020).

### react.dev — Thinking in React (official)
- Official React docs' component-hierarchy exercise: break the UI into a
  hierarchy by identifying sections and sub-sections down to the smallest
  unit; the single-responsibility framing given in secondary sources is that
  a component ideally does one thing, and if it grows past that it should be
  decomposed. Because UI typically mirrors a data model, component boundaries
  often map onto data-model boundaries.
- (Search-verified via multiple mirrors of the official doc content; treat as
  official-docs-adjacent rather than a single stable URL — re-verify the
  canonical `react.dev/learn/thinking-in-react` URL before citing directly in
  the skill.)

### Dan Abramov — Presentational and Container Components (2015, self-retracted)
- https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0
- Abramov added an update to his own canonical post: **"I don't suggest
  splitting your components like this anymore... I've seen it enforced
  without any necessity and with almost dogmatic fervor far too many times."**
  Reason given: custom Hooks (introduced 2019) removed the only structural
  reason for the container split — extracting stateful logic without a
  wrapper component.
- Skill implication: cite container/presentational as **retired as a
  mandatory pattern**, surviving only as "custom hooks for logic, headless
  components only when one behavior needs multiple visual skins."

### "Rule of three" / incompatible-props framing (community consensus)
- Cross-source convergence (DEV Community pieces on splitting, single-
  responsibility-in-React writeups): a defensible **split signal** distinct
  from Dodds' list — *props that can't meaningfully combine* (two logically
  different components sharing one interface), and the "rule of three"
  (extract an abstraction only once three concrete use cases exist). Treat as
  secondary/community-tier, not canon — corroborating detail alongside Dodds
  and Metz, not a standalone authority.

## 3. Business logic placement

### react.dev — Reusing Logic with Custom Hooks (official)
- https://react.dev/learn/reusing-logic-with-custom-hooks
- **Naming rule, verbatim:** "Hook names must start with `use` followed by a
  capital letter." And the deciding question for the opposite case: **"No.
  Functions that don't *call* Hooks don't need to *be* Hooks."** Example given
  in the docs: prefer `getSorted(items)` over `useSorted(items)` when no Hook
  is called, specifically so the function stays callable conditionally and
  from anywhere.
- **Purity requirement:** "The code inside your custom Hooks will re-run
  during every re-render... Think of custom Hooks' code as part of your
  component's body" — i.e., custom Hooks must be pure, same as components.
- Official caution against overly generic "lifecycle" hooks (`useMount`,
  `useEffectOnce`) — "**Keep custom Hooks focused on concrete high-level use
  cases**" (`useChatRoom`, `useMediaQuery`, not generic escape hatches).
- This is the primary source for the skill's **testability dividing line**:
  if it doesn't need React to run, it's a plain function, tested directly; if
  it orchestrates state/effects, it's a hook, tested via `renderHook`.

### react.dev — You Might Not Need an Effect (official)
- https://react.dev/learn/you-might-not-need-an-effect
- Canonical source for "business logic in `useEffect` is the anti-pattern."
  Deciding question, verbatim in spirit: is the logic caused by a specific
  *interaction* (→ event handler) or by the component merely *being on
  screen* (→ Effect)? Example given: a POST request triggered by a button
  press belongs in the event handler, not an Effect keyed off state.
- Effects are exclusively for **synchronizing with an external system**
  (network, DOM, non-React widget) — anything else (derived state, chained
  effects reacting to each other) is refactorable away, per the doc's own
  worked examples.

### Separation of Concerns with React Hooks — Felix Gerschau
- https://felixgerschau.com/react-hooks-separation-of-concerns/
- Practical treatment of the pattern: `components/` stay render + event
  wiring, `hooks/` hold orchestration (state, effects, query composition),
  `services/`/plain modules hold pure business rules. Positions custom hooks
  as the direct hooks-era replacement for the container half of
  container/presentational (ties back to §2's Abramov retraction).

### TkDodo (Dominik Dorfmeister) — React Query as a State Manager / Deriving
Client State from Server State
- https://tkdodo.eu/blog/react-query-as-a-state-manager
- https://tkdodo.eu/blog/deriving-client-state-from-server-state
- Canonical **server state vs. client state** split for the TanStack Query
  ecosystem: React Query owns async/server data — caching, retries,
  background refetch — and "the frontend application doesn't own the data."
  UI-only state (open/closed, selected tab) stays in ordinary component
  state; when the two must combine, **derive** the client view from server
  data declaratively rather than copying query results into a store.
- Practical tuning lever named explicitly: adjust `staleTime` rather than
  disabling refetch flags wholesale.

### Kent C. Dodds — Application State Management with React
- https://kentcdodds.com/blog/application-state-management-with-react
- Broader argument that colocation-based state management (plus React Query
  for server cache) is sufficient for most apps, including "large enterprise
  apps," without a global client-state library — corroborates TkDodo's split
  and argues the *residual* client state, once server state is properly
  separated, is small enough not to need Redux/Zustand-class tooling by
  default.

## 4. Constants, utils, types, config

### Constants placement — community consensus (Medium/DevGex/Substack pieces)
- https://medium.com/@austinpaley32/how-to-add-a-constants-file-to-your-react-project-6ce31c015774
- https://tomzhangdev.substack.com/p/where-should-you-declare-constants
- Consensus across these pieces: constants that don't depend on props/state
  don't belong inside the component body (recreated every render for no
  reason); a dedicated `constants/` location is justified for genuinely
  shared, app-wide values, subdivided by domain rather than one flat file.
  Source-quality note: these are practitioner blog posts, not standards
  bodies — corroborating detail, not canon. Cross-check against Comeau's
  `constants/` folder (§1) for the "app-wide only" version of this rule and
  against colocation (§1, Dodds) for the competing default of colocating a
  constant with its one usage site until a second consumer appears.

### The Utility Sink / Dunghill anti-pattern
- https://dev.to/duplessisvanaswegen/helper-utility-factory-or-something-more-sinister-426e
- https://mattilehtinen.com/articles/dunghill-anti-pattern-why-utility-classes-and-modules-smell/
- Names the failure mode precisely: an undifferentiated `utils.ts` "has no
  identity, so it absorbs" unrelated logic by default, because dumping a
  function there is always the path of least resistance. Once a team creates
  one Utils file, "it gives a big green light... to start sending their junk
  methods into it."
- Distinguishes **helper** (project-specific) from **utility** (generic,
  portable, lodash-shaped) as a useful vocabulary split, even though projects
  disagree on which word means which (see §7 disagreements).
- Prescription: name utility modules by domain (`format-date.ts`,
  `currency.ts`), cap unrelated functions per file, and delete orphaned
  utilities once their last caller is gone rather than let them accumulate.

### TypeScript Handbook — Enums, and the `as const` alternative
- https://www.typescriptlang.org/docs/handbook/enums.html
- Official handbook language, in spirit: "in modern TypeScript, you may not
  need an enum when an object with `as const` could suffice" — keeps the
  codebase aligned with plain JavaScript (enums are a TS-only runtime
  construct) and avoids the extra runtime object enums generate.
- Community-verified default (multiple 2026 pieces converge): **default to
  `as const` objects + `typeof X[keyof typeof X]` for literal unions that
  need runtime values or iteration; use plain literal unions when no runtime
  value is needed; avoid `const enum` entirely in code that crosses module
  boundaries** (it inlines at compile sites and breaks under isolated-modules
  transpilation, including esbuild/SWC-based toolchains).

### T3 Env — typed, schema-validated environment config
- https://env.t3.gg/docs/introduction
- https://create.t3.gg/en/usage/env-variables
- The reference implementation of "one typed, schema-validated env module":
  `createEnv()` wraps Zod (or any Standard-Schema validator) around
  `process.env`, splits server-only vars from `NEXT_PUBLIC_`-prefixed client
  vars, and exports a single parsed `env` object the rest of the app imports
  — no scattered raw `process.env` reads. Directly corroborates the backend
  skill's 12-Factor citation (`onion-architecture` §13.4) from the frontend
  side, and matches this repo's own `env.t.s`-style pattern description
  already drafted in the cloned reference skill.

## 5. Barrel files & import-boundary enforcement

### Barrel files — the 2026 case against, with receipts
- https://medium.com/@wul55267/barrel-files-why-index-ts-re-exports-hurt-tree-shaking-next-js-dev-memory-and-tsc-2026-005a27a14689
  (mirrored at dev.to/childrentime and reactuse.com/blog/barrel-files-tree-shaking)
- Concrete, checkable claims: barrel re-exports defeat tree-shaking under
  wildcard exports (cited real-world case: importing one MUI `Button` through
  a barrel nearly doubled bundle size); they inflate the module graph webpack/
  tsc/ESLint must traverse, measurably slowing dev-server and typecheck time;
  Next.js's own barrel-optimization flag reports **15–70% faster dev builds**
  when barrels are bypassed. Barrels are also a common site for undetected
  circular dependencies (`Cannot access 'X' before initialization`).

### Josh Comeau — the dissenting, pro-barrel voice (same §1 article)
- https://www.joshwcomeau.com/react/file-structure/
- Direct rebuttal, verbatim in spirit: bundlers spend the overwhelming
  majority of their time on third-party dependencies, so "less than 1%" of
  modules being author-written barrels doesn't matter at application scale;
  recommends automating the boilerplate (`new-component`-style generators)
  rather than banning the pattern. Cite as the explicit counter-position — a
  genuine, named disagreement, not a straw man.
- Net skill guidance (synthesizing both): treat barrels as acceptable for a
  **library's public entry point** or a single-component forwarder, and avoid
  wide re-export barrels in application code, per the weight of the 2026
  tooling-side evidence — this is the position already drafted in the cloned
  reference skill and this pass's research does not contradict it.

### eslint-plugin-boundaries vs. `import/no-restricted-paths`
- https://github.com/javierbrea/eslint-plugin-boundaries
- https://www.npmjs.com/package/eslint-plugin-boundaries
- `import/no-restricted-paths` (from `eslint-plugin-import`) requires manually
  listing every restricted zone and works per-import-statement, with no
  graph-level modeling. `eslint-plugin-boundaries` instead lets a project
  declare **architectural element types** (feature, shared, entity, etc.) and
  writes rules over those types rather than raw paths — the more scalable
  mechanism for enforcing bulletproof-react's/FSD's unidirectional-import
  rule as the app grows past a handful of features.
- Skill implication: recommend `import/no-restricted-paths` for a small
  number of layers (shared/features/app, 3 buckets) and
  `eslint-plugin-boundaries` once the app has named feature/entity/widget
  element types worth enforcing individually (FSD-style).

## 6. Next.js App Router architecture (structural, not RSC mechanics)

### Next.js official docs — Project Structure
- https://nextjs.org/docs/app/getting-started/project-structure
- Explicit framework stance, verbatim: **"Next.js is unopinionated about how
  you organize and colocate your project files."** Gives the mechanics that
  *enable* structure choices rather than mandating one:
  - **Colocation is safe by default** inside `app/` — a route is only public
    once it has a `page.js`/`route.js`; any other file in that folder is
    "safely colocated... without accidentally being routable."
  - **Private folders** (`_folder`) opt a folder and its subtree out of
    routing — useful for "separating UI logic from routing logic" even though
    colocation doesn't strictly require the underscore.
  - **Route groups** (`(folder)`) organize routes and enable multiple
    layouts/root-layouts at the same URL level without affecting the path.
  - Three named example strategies, presented as equally valid: project files
    entirely **outside** `app/`, project files in **top-level folders inside**
    `app/`, and files **split by feature/route** with only truly global code
    at the `app/` root. The doc's own summary: *"choose a strategy that works
    for you and your team and be consistent across the project"* — direct
    textual support for this skill's "consistency beats the specific choice"
    principle.

### Next.js official docs — How to think about data security (Data Access Layer)
- https://nextjs.org/docs/app/guides/data-security
- Names **three data-fetching approaches** explicitly and tells you to pick
  one and not mix them: **External HTTP APIs** (existing backend, Zero-Trust
  model — *this repo's actual case*, since `client/` fronts the separate
  Fastify `server/`), **Data Access Layer** (new projects; a `server-only`
  internal library that performs authorization and returns minimal DTOs), and
  **Component-level data access** (prototypes only — explicitly flagged as
  the shape that leaks private fields to the client by accident).
- DAL contract, verbatim: **"Only run on the server. Perform authorization
  checks. Return safe, minimal Data Transfer Objects (DTOs)."** Pattern shown
  uses React's `cache()` to memoize a `getCurrentUser()` read per request and
  a `server-only`-guarded module for the DTO-shaping function.
- Explicit rule on secrets: *"only the Data Access Layer should access
  `process.env`"* for secret keys — the frontend-side mirror of the backend
  skill's "config/secrets read in exactly one place" rule (`onion-architecture`
  §13.4), and independent corroboration for this skill's own env/config rule
  in §4.
- For this repo specifically: `client/AGENTS.md` already states the local
  equivalent — all API calls go through `src/lib/api.ts` + a hook in
  `src/lib/hooks/*`, and "don't `fetch()` directly from a component." That is
  the **External HTTP APIs** case in the framework's own taxonomy, not a
  from-scratch DAL — the skill should name this explicitly so nobody "fixes"
  it into a DAL-over-DB shape that doesn't apply here.

### Next.js official docs — Server Actions and Mutations / Data Security (mutations)
- https://nextjs.org/docs/app/guides/server-actions
- https://nextjs.org/docs/app/guides/data-security#mutating-data
- **Security framing, verbatim:** "A Server Action runs as a POST request
  against the page that invokes it... The implementation stays on the server,
  but the route is reachable to anyone who can send the same POST. Treat
  every action as an untrusted entry point." Framework protections (encrypted
  action IDs, dead-code elimination of unused actions, CSRF origin/host check,
  1MB body cap) are named explicitly as **not a substitute for
  application-level checks**.
- Three per-action requirements stated as a checklist: **authenticate and
  authorize inside the action itself** (a page-level redirect does not
  protect the action — shown with a worked "delete records" example),
  **validate inputs** (FormData/params/headers are untrusted), and
  **constrain return values** (shape the response to what the UI needs, never
  raw DB rows).
- **Thin-controller pattern, with code:** the DAL pattern extends to
  mutations — a `server-only` module (`data/posts.ts`) holds
  auth+authorization+DB logic; the `'use server'` action in `app/actions.ts`
  only calls that module and then revalidates. Matches this skill's
  "Server Actions are thin controllers" rule 1:1, sourced directly rather
  than inferred.
- IDOR-specific guidance, with a worked example: a client may legitimately
  say *which* resource to act on (an ID), but must never supply the resource's
  contents or ownership — re-derive both from the authenticated session and
  re-fetch, don't trust a client-submitted object even after schema
  validation, since **"schema validation only checks the shape of the input"**
  not ownership.

### Next.js official docs — Server and Client Components (getting started)
- https://nextjs.org/docs/app/getting-started/server-and-client-components
  (cross-referenced from the data-security guide above; official default
  stated there: Server Components run only on the server and can safely
  touch secrets/DBs/internal APIs; Client Components "must follow the same
  security assumptions as code running in the browser" even during
  server-side prerendering.)
- Practical consequence already drafted in the cloned reference skill and
  corroborated here: **Server Components by default, `'use client'` pushed to
  the leaves** — the directive is a one-way module-graph door (everything a
  client-marked file imports ships to the browser), so *where* a file sits
  relative to that boundary is an architectural decision, not a stylistic one.

## 7. Cross-source consensus (skeleton for the skill)

1. **Colocate by default; extract only on proven reuse.** Dodds' colocation
   principle, bulletproof-react's "colocate first, extract later," and
   Wieruch's progressive-evolution model all converge here — extraction is a
   response to a second consumer appearing, not a plan.
2. **A promotion ladder, not a fixed folder count.** Component body → file
   level → feature-local → shared, matching bulletproof-react's feature
   folders, FSD's layer/slice/segment model (a stricter formalization), and
   Wieruch's 5-step evolution.
3. **Imports point one way: shared → features → app; no cross-feature
   imports.** Explicit in bulletproof-react and FSD alike; enforce
   mechanically (`import/no-restricted-paths` for few layers,
   `eslint-plugin-boundaries` once element types multiply), not by convention
   — the same "mechanical enforcement over trust" theme as the backend
   skill's dependency-cruiser section.
4. **Split components on a concrete trigger, never preemptively.** Dodds'
   seven problems + Metz's "duplication is cheaper than the wrong
   abstraction" + Dodds' own AHA programming are one consistent voice here;
   react.dev's single-responsibility framing in Thinking in React is the
   complementary "how would you even describe this component" test.
5. **Container/presentational is retired as a mandatory rule** — Abramov's
   own retraction, superseded by custom hooks for logic extraction.
6. **A function is a Hook only if it calls Hooks; otherwise it's a plain
   function, testable directly.** Official react.dev rule, and the direct
   basis for this skill's three-band (component / hook / plain module) model.
7. **`useEffect` is for external-system synchronization only; business logic
   triggered by user interaction belongs in the event handler.** Official
   react.dev "You Might Not Need an Effect," independently reinforced by
   Gerschau's separation-of-concerns treatment.
8. **Server state and client state are different things and should not be
   merged into one store.** TkDodo's React-Query-as-state-manager position,
   corroborated by Dodds' own state-management post recommending colocation +
   React Query over a global client-state library by default.
9. **No global grab-bag `utils.ts`; name utility modules by domain and delete
   orphans.** The Utility Sink/Dunghill sources, consistent with colocation's
   general "give code an identifiable home" theme.
10. **Prefer `as const` objects/literal unions over TS `enum`; never
    `const enum` across module boundaries.** TypeScript Handbook's own
    stated preference plus 2026 community consensus on isolatedModules
    breakage.
11. **Config/secrets: one typed, validated module; nothing else reads
    `process.env` for secrets.** T3 Env's implementation pattern and the
    Next.js Data Access Layer guide's explicit "only the DAL should access
    `process.env`" rule are independent corroboration of the same principle
    the backend skill states for `server/`.
12. **Barrel files are acceptable at a library's public boundary or as a
    single-component forwarder; avoid wide re-export barrels in application
    code** — the 2026 tooling evidence (tree-shaking, dev-server memory,
    circular-dependency hotspots) outweighs Comeau's counter-argument at
    application scale, though the counter-argument is real and should be
    named, not hidden.
13. **Next.js is deliberately unopinionated on file organization** — the
    framework's own docs say so explicitly; this skill's job is to pick one
    of the framework's named strategies for *this* repo and hold it
    consistently, not to claim the framework mandates a shape.
14. **Pick one data-fetching approach for the whole app and don't mix it**
    (External HTTP API / DAL / component-level) — official Next.js guidance,
    and this repo is explicitly the External-HTTP-API case (`client/`
    fronting `server/`), not a from-scratch DAL-over-DB.
15. **Server Actions are public POST endpoints; authenticate, authorize, and
    validate inside every one regardless of page-level gating** — official
    Next.js Server Actions + Data Security guides, with a worked IDOR example
    each.
16. **Server Components by default; `'use client'` pushed to the leaves** —
    official Next.js Server/Client Components docs; the boundary is an
    architectural decision because of the module-graph "ships to the
    browser" consequence, not a style preference.

## 8. Genuine disagreements to acknowledge in the skill

- **Feature folders vs. technical/function folders.** Bulletproof-react, FSD,
  and the 2026 "scalable project" survey pieces default to feature folders at
  scale; Josh Comeau explicitly rejects them for the reason that real
  categorization is hard and boundaries blur as products evolve. Present as a
  genuine, size- and team-shaped dial — not "Comeau is wrong."
- **Barrel files: acceptable vs. actively harmful.** 2026 tooling-side
  evidence (tree-shaking loss, dev-server slowdown, circular-dependency
  hotspots) is fairly one-sided against wide barrels in application code, but
  Comeau's counter (barrels are <1% of the module graph at app scale) is a
  named, credible dissent, not a straw man — cite both.
- **Where constants belong.** Colocation (Dodds) says keep a constant next to
  its one usage site until a second consumer needs it; several practitioner
  posts recommend a dedicated `constants/` directory from the start. The
  cloned reference skill's resolution — colocate by default, a `constants.ts`
  justified per-feature or for genuinely app-wide values, never one global
  dumping file — reconciles both without contradicting either.
- **`helper` vs. `utility` vs. `lib` vocabulary.** No canonical winner; the
  Utility Sink sources distinguish helper (project-specific) from utility
  (generic/portable) but acknowledge teams use the words inconsistently.
  Robin Wieruch's own material uses `lib/` where bulletproof-react uses
  `utils/` for similar content. Resolution: pick one scheme, apply it
  consistently — don't present either vocabulary as correct.
- **`import/no-restricted-paths` vs. `eslint-plugin-boundaries`.** Not a
  disagreement so much as a scale-dependent choice — the simpler rule suffices
  for 2–3 layers; the element-typed plugin earns its complexity once a
  project has many named feature/entity/widget types (FSD-shaped codebases).
- **How much Next.js App Router ceremony to adopt.** The framework's own docs
  present External HTTP APIs / DAL / component-level access as three
  *equally valid* strategies keyed to project shape, not a maturity ladder —
  resist the temptation to tell every project to "graduate" to a DAL when it
  is, like this repo, legitimately the External-HTTP-API case.
- **Source-quality gradient:** react.dev, the TypeScript Handbook, Next.js's
  own docs, Kent C. Dodds, Dan Abramov, Sandi Metz, and TkDodo are canon or
  canon-adjacent (maintainer/official-doc authority). Bulletproof-react and
  Feature-Sliced Design are widely adopted community references, not
  standards bodies. The Medium/DEV Community pieces on constants placement,
  the utility-sink anti-pattern, and 2026 barrel-file benchmarks are
  individually authored and practically useful but not vetted the same way —
  flag this gradient in the skill the way `onion-architecture` does.

## 9. Mapping to this repo (`client/`)

`client/` already implements a proto version of several rules above; the
skill's job is to name them and stop drift, per the same philosophy as the
backend skill's own repo-mapping section.

| Concept above | Where it lives today in `client/` |
|---|---|
| Route-private colocation (`_folder`) | `src/app/<route>/_components/<Name>/` — feature logic colocated with its route, kept out of routing via the underscore convention |
| Shared/cross-cutting components | `src/components/app-shell` (nav/chrome), `src/components/diff-viewer/*`, `src/components/mermaid-diagram`, `src/components/page-shell`, `src/components/showcase` |
| API layer / Data Access pattern | `src/lib/api.ts` (the one place that knows `NEXT_PUBLIC_API_BASE`) + `src/lib/hooks/*` (every server-data access point, TanStack Query) — the **External HTTP APIs** case from §6, not a DAL-over-DB |
| Vendored shared contracts | `src/vendor/shared/contracts` (hand-synced copy of `@devdigest/shared` — canonical copy is `server/src/vendor/shared/`, see root `AGENTS.md`) |
| Vendored UI kit | `src/vendor/ui/{charts,command-palette,kit,primitives,shell}` |
| i18n | `src/i18n` + `messages/<locale>/*.json` (next-intl) |
| Thin routing layer | `src/app/**/page.tsx` — explicitly documented in `client/AGENTS.md` as "kept thin" |

Existing conventions the skill must speak to, not fight:
- **"Don't `fetch()` directly from a component"** is already a stated rule in
  `client/AGENTS.md` — the skill should cite this as the local instance of
  §6's "components never fetch directly" principle, sourced from TkDodo/
  bulletproof-react's API-layer pattern plus the Next.js External-HTTP-APIs
  guidance.
- **`src/components/` is for cross-cutting chrome only** — already stated;
  the skill should frame this as the shared-vs-feature split from §1/§7.2,
  with the promotion trigger being "a second route needs this component."
- No `features/` top-level folder exists yet — routes under `src/app/` play
  that role via their own `_components/`. The skill should describe this
  shape (Next.js's own "split by feature or route" strategy from §6) rather
  than prescribe a from-scratch `src/features/` migration.
- `vendor/` directories are canonical-copy territory (per root `AGENTS.md`) —
  the skill must repeat the "don't hand-edit; the canonical copy is in
  `server/`" warning for `vendor/shared`, mirroring the backend skill's own
  vendor warning.

## 10. Plan for SKILL.md (not yet written)

Proposed shape, following `onion-architecture`'s precedent exactly:
`SKILL.md` (rules only, target ~250 lines) + `README.md` (sourced
justification distilled from this file, one paragraph per major claim with
its citation).

Draft frontmatter description: *"Frontend UI architecture and code
organization for React + Next.js App Router. Use when deciding where files
and components live, how to split a component, where business logic /
constants / utils / types / config belong, how to structure features and the
API layer, or where Server Actions and data access go. Structural decisions
only — hooks/state/performance rules live in react-best-practices; RSC and
file-convention mechanics live in next-best-practices."*

Proposed sections (source refs to this file's numbering):
1. **Core principles** — colocation as default, the promotion ladder,
   unidirectional imports, consistency over the specific choice — §1, §7.1–3
2. **Folder structure** — technical-folders-for-small-apps vs
   feature-folders-at-scale as a size dial; one-folder-per-component;
   barrel-file guidance (both sides) — §1, §5, §8
3. **Component splitting** — trigger-based splitting (Dodds' seven
   problems), AHA/wrong-abstraction caution, container/presentational
   retirement, composition moves — §2, §7.4–5
4. **Business logic placement** — the three-band model (component / hook /
   plain module), the Hook-naming test, `useEffect` anti-pattern, server
   state vs client state — §3, §7.6–8
5. **Constants, utils, types, config** — colocate-by-default with the
   per-feature/app-wide `constants.ts` exception, no utility-sink, `as const`
   over `enum`, one typed env module — §4, §7.9–11
6. **Import boundaries & enforcement** — shared→features→app, which ESLint
   rule at which scale — §5, §7.3
7. **Next.js App Router architecture** — thin `app/`, the three data-access
   strategies (naming this repo's as External HTTP APIs explicitly), Server
   Actions as thin controllers with the IDOR pattern, Server-by-default/
   Client-at-the-leaves — §6, §7.13–16
8. **This repo (`client/`)** — the §9 table, stated as current shape, not a
   migration target
9. **Known judgment calls** — condensed §8

Follow-ups (not part of SKILL.md itself):
- Register the skill in `.claude/skills/README.md` once `SKILL.md` ships.
- Consider whether `import/no-restricted-paths` (shared/features/app, 3
  buckets) is worth wiring into `client/`'s ESLint config as the mechanical
  enforcement layer — `client/` currently has no `features/` folder, so this
  is aspirational until/unless that shape is adopted.
