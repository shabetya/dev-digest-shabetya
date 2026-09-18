# Insights — server

A running log of non-obvious lessons learned while building `@devdigest/api`:
decisions that surprised us, dead ends, workarounds, and the reasoning behind
them. Append newest entries at the top. Not a changelog — skip anything
already obvious from the code or covered in [`AGENTS.md`](AGENTS.md).

<!-- Example entry:
## 2026-01-15 — <short title>
What happened, why it wasn't obvious, what we did about it.
-->

## 2026-09-18 — [Gotcha] the long-running local Postgres volume can shadow new seed.ts data by name

While adding `Test Quality Reviewer` / `API Contract Reviewer` / `pr-self-review`
to `seed.ts`, the shared local `devdigest-postgres` Docker volume already had
rows with those exact agent names (and six extra skills like
`contract-breaking-change`, `mocking-smells`) from earlier, unrelated
work in this same long-lived dev environment — not created by `seed.ts` at all
(confirmed: `seed.ts` had zero skills-seeding logic before this change). Because
the seed's idempotent pattern is "insert only if a row with this name doesn't
exist" (`seed.ts`'s `for (const a of seedAgents) { ... if (!existing) insert }`),
the pre-existing rows silently won and the newly-added prompt/skill content in
this commit never actually got applied when re-seeding THAT container — it only
takes effect against a genuinely fresh database. When verifying a seed.ts change
against the persistent local volume (which `docker compose down -v` wipes but a
plain `down`/restart does not), don't trust that what the API returns reflects
only what the current seed script creates — check the row's actual content (or
wipe the volume) before assuming a seeded value took effect.
