# Insights — client

A running log of non-obvious lessons learned while building `@devdigest/web`:
decisions that surprised us, dead ends, workarounds, and the reasoning behind
them. Append newest entries at the top. Not a changelog — skip anything
already obvious from the code or covered in [`CLAUDE.md`](CLAUDE.md).

## 2026-09-15 — [Decision] New `Popover` primitive uses `position: fixed`, not `Dropdown`'s `position: absolute`
The PR list's `tableCard` (`client/src/app/repos/[repoId]/pulls/styles.ts:87-93`) sets `overflow: hidden` for its rounded corners. The existing `Dropdown` (`client/src/vendor/ui/kit/Dropdown.tsx:83-99`) positions its panel with `position: absolute` inside a relatively-positioned wrapper, so it gets clipped by any `overflow: hidden` ancestor — reusing it for a popup anchored inside a PR list row silently produces an invisible/clipped panel. `client/src/vendor/ui/kit/Popover.tsx` was added instead: it measures the trigger's `getBoundingClientRect()` on open and renders the panel with `position: fixed`, whose containing block is the viewport rather than the nearest clipping ancestor (true as long as no ancestor sets `transform`/`filter`/`contain`, which none of this app's chrome does). Prefer `Popover` over `Dropdown` for anything that might render inside a scrolling/clipped container.

<!-- Example entry:
## 2026-01-15 — <short title>
What happened, why it wasn't obvious, what we did about it.
-->
