---
name: engineering-insights
description: "Captures non-obvious engineering findings — surprising bugs, dead ends, workarounds, decisions made for reasons invisible in the code, recurring mistakes and their fixes — and appends them to the INSIGHTS.md of whichever package (server/, client/, reviewer-core/, e2e/) the finding belongs to. Proactively use throughout any coding session in this repo, not just at the end, whenever you hit something a future session would need to be told rather than rediscover. Also read the relevant package's INSIGHTS.md before starting any task that touches it."
---

# Engineering Insights

> **No finding, no write.** Most sessions touch a package and produce nothing
> worth recording — that's the expected, default outcome. Only append to
> `INSIGHTS.md` when the work actually surfaced something that clears the
> quality bar below. Never write a placeholder, a summary of what you did, or
> an entry just to show this skill ran.

## Read first, every time

As soon as a prompt touches a concrete package — it names one, or the files it
implies live under `server/`, `client/`, `reviewer-core/`, or `e2e/` — read
that package's `INSIGHTS.md` before starting. This isn't conditional on how
big the task looks: a one-line fix is exactly where a known gotcha gets
rediscovered the hard way. Skip it only for work that touches no package at
all (e.g. root-level docs, tooling shared across all four).

## When to consider writing

Only these count as findings — anything else isn't worth an entry:

- A bug or behavior that genuinely surprised you.
- An approach you tried and abandoned, and why it didn't work.
- A decision made for a reason that isn't visible from reading the code.
- A workaround for a library/tool quirk (Fastify, Drizzle, Next.js, the LLM
  provider, testcontainers, etc.).
- A mistake — yours or a prior session's — that's likely to recur if unrecorded.

## The quality bar

**If this would be obvious to anyone reading the code, don't write it down.**
Every entry must be actionable "cold" — a future session should read it and
know exactly what to do, with no need to re-derive the reasoning.

Vague (don't write this):
> Drizzle relations can be tricky.

Useful (write this instead):
> `db.query.pulls.findMany({ with: { reviews: true } })` silently returns
> `reviews: []` instead of erroring when the relation isn't declared in
> `relations()` — always check `src/db/schema.ts` has the matching
> `relations()` block before debugging an empty-array result.

Test before writing: *if this would be obvious to anyone who reads the code,
don't write it.*

## Categories

Tag each entry's title with one of these, in brackets, so the flat log stays
scannable without introducing new sections:

- `Pattern` — an approach that worked, worth repeating.
- `Antipattern` — an approach that looked reasonable but didn't work.
- `Decision` — a choice made for a reason that isn't visible in the code.
- `Gotcha` — a surprising bug or behavior, and how to avoid it.
- `Tool Note` — a library/dependency quirk.

## Where to write

Pick the package whose `INSIGHTS.md` the finding belongs to, based on where
the root cause lives — not every package the session happened to touch. A
finding that spans packages (e.g. a shared-contract drift between
`server/src/vendor/shared` and `client/src/vendor/shared`) goes wherever the
next person hitting it would look first.

## Dedupe before writing (mandatory)

Before appending, re-read the package's `INSIGHTS.md` and check whether an
existing entry already covers the same fact or behavior:

- If one exists and is still accurate — write nothing.
- If one exists but is now wrong or incomplete — add a new dated entry that
  explicitly supersedes it (reference the old entry's date and title). Never
  duplicate or silently delete the old entry.
- Only write a fresh entry when the finding isn't already covered.

## How to write

- Prepend the new entry directly under the file's intro paragraph (newest
  entries at the top) — keep the intro paragraph and the commented example
  block in each `INSIGHTS.md` exactly as they are.
- Match the file's existing heading format: `## <YYYY-MM-DD> — [<Category>]
  <short title>`, followed by 1-3 sentences of prose.
- Cite `file:line` evidence when the finding is about specific code.
- Never restate anything already covered in that package's own `CLAUDE.md` —
  `INSIGHTS.md` is for what surprised you, not what's already documented.
- `INSIGHTS.md` is not a changelog and not a session transcript — don't log
  what you did, only what you learned.
