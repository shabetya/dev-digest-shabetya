# Insights — client

A running log of non-obvious lessons learned while building `@devdigest/web`:
decisions that surprised us, dead ends, workarounds, and the reasoning behind
them. Append newest entries at the top. Not a changelog — skip anything
already obvious from the code or covered in [`AGENTS.md`](AGENTS.md).

## 2026-10-12 — [Gotcha] Promoting a route-private folder to `src/components/` breaks its own internal absolute imports, silently and past `pnpm typecheck`
Moving `RunTraceDrawer` from `src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/` to `src/components/run-trace-drawer/` is supposed to be a pure, unchanged-internals move, but several of its own `_components/*` files (`TraceBody.tsx`, `ProjectContextBlock.tsx`, `ToolCallRow.tsx`, `PromptBlock.tsx`, `FindingsSection.tsx`, `TraceSection.tsx`) imported sibling `constants`/`styles` via the absolute alias `@/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/...` instead of a relative `./constants`. `pnpm typecheck` passed anyway — TS resolves path aliases fine even for a path that no longer logically "belongs" where it's used, because the aliased file still physically exists at the old location until you delete the old folder. The failure only shows up as a Vite "Failed to resolve import … Does the file exist?" at `pnpm test`/`pnpm build` time, after the old folder is actually removed. Before declaring a component-folder move done, `grep -rn '@/app/...<old-folder-path>' <new-folder>/` for leftover self-references, and only then delete the old folder.

## 2026-10-12 — [Gotcha] A moved test file's `vi.mock(relativePath, …)` and `import messages from "../../.../x.json"` both silently point at the wrong module after the move
Same move as above: `RunTraceDrawer.test.tsx` and `ProjectContextBlock.test.tsx` had `vi.mock("../../../../../../../lib/hooks/trace", …)` and `import messages from "../../../../../../../../messages/en/runs.json"` — correct for the old 7-8-level-deep path, silently wrong (resolves to nothing / throws "Cannot find module") once the file is 2-3 levels shallower. Recompute every such relative path by literally counting directory segments from the test file's new location; a `vi.mock` with a path that resolves to a different physical file than the component's own `@/...`-aliased import of the same module **does not get caught by any error** — the real hook runs unmocked instead (manifests downstream as e.g. "No QueryClient set" from a `useQuery` that should have been stubbed out).

## 2026-10-12 — [Gotcha] `vi.mock` factory referencing an outer `vi.fn()` declared with plain `const` throws "Cannot access 'x' before initialization"
`vi.mock(...)` calls are hoisted by Vitest to the top of the test file, above any top-level code — so a factory that closes over `const findingActionMutate = vi.fn()` declared later in the same file hits the `const`'s TDZ at hoist-time, not a normal "undefined" issue. Fix: declare every `vi.fn()` a `vi.mock` factory needs via `const { a, b } = vi.hoisted(() => ({ a: vi.fn(), b: vi.fn() }))` before the `vi.mock` calls, never as a bare top-level `const`.

## 2026-09-15 — [Gotcha] `Popover`'s close-on-scroll listener also fired for scrolling inside its own panel
`client/src/vendor/ui/kit/Popover.tsx` registered `window.addEventListener("scroll", close, true)` to dismiss the popover when the page scrolls out from under it. Scroll events don't bubble, but a capture-phase (`true`) listener on `window` still intercepts every scroll event in the document on its way down to the target — including the one fired by the panel's own `overflowY: "auto"` content. The result: any attempt to scroll the popover's findings list closed it instantly, before the scroll could register. Fixed by checking `panelRef.current?.contains(e.target as Node)` inside the handler and skipping `close()` when the scroll originated inside the panel itself.

## 2026-09-15 — [Decision] New `Popover` primitive uses `position: fixed`, not `Dropdown`'s `position: absolute`
The PR list's `tableCard` (`client/src/app/repos/[repoId]/pulls/styles.ts:87-93`) sets `overflow: hidden` for its rounded corners. The existing `Dropdown` (`client/src/vendor/ui/kit/Dropdown.tsx:83-99`) positions its panel with `position: absolute` inside a relatively-positioned wrapper, so it gets clipped by any `overflow: hidden` ancestor — reusing it for a popup anchored inside a PR list row silently produces an invisible/clipped panel. `client/src/vendor/ui/kit/Popover.tsx` was added instead: it measures the trigger's `getBoundingClientRect()` on open and renders the panel with `position: fixed`, whose containing block is the viewport rather than the nearest clipping ancestor (true as long as no ancestor sets `transform`/`filter`/`contain`, which none of this app's chrome does). Prefer `Popover` over `Dropdown` for anything that might render inside a scrolling/clipped container.

<!-- Example entry:
## 2026-01-15 — <short title>
What happened, why it wasn't obvious, what we did about it.
-->
