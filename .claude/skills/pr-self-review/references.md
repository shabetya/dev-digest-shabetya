# References

- The skill → glob mapping table in `SKILL.md` mirrors the per-package
  `paths:` filters already in `.github/workflows/client.yml`,
  `server-unit.yml`, `server-integration.yml`, `reviewer-core.yml`, and
  `e2e-web.yml` — including the cross-package exceptions those workflows
  already document in their own header comments (e.g. `server-unit.yml`
  also watching `reviewer-core/**`, `reviewer-core.yml` also watching
  `server/src/vendor/shared/**`). Those files are the source of truth for
  package boundaries; update this skill's table if they change.
- The vendored-shared-contract gotcha (`server/src/vendor/shared` vs.
  `client/src/vendor/shared` drifting) is documented in the root
  [CLAUDE.md](../../../CLAUDE.md) under "Non-default conventions".
- The generic severity table in `SKILL.md` is this skill's own scale for
  non-security findings. For security findings specifically, defer to
  `security/SKILL.md`'s "Severity Classification" table rather than
  re-judging against the generic one.
- The "routes.ts querying the database directly" CRITICAL pattern used in
  `examples.md` is called out explicitly in `onion-architecture/SKILL.md`
  under "Module Anatomy & the Promotion Ladder" as a violation regardless of
  a module's stage.
