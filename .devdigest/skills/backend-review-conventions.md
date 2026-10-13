# backend-review-conventions

# Backend review conventions
Apply these rules only to changed backend files (Fastify routes, services,
repositories, or other server-side TypeScript — files under a `server/` or
`api/` directory).

- Flag any route handler that reads request data without going through a
  declared Zod `params`/`body`/`querystring` schema on the route.
- Flag a database query missing a workspace/tenant scope filter — every row
  read or written must be scoped to the caller's workspace.
- Flag a multi-statement write (more than one dependent insert/update) that
  isn't wrapped in a transaction.
- Flag a secret, API key, or credential read from anywhere other than the
  project's secrets provider (never hardcoded, never read from a generic env
  var helper meant for non-secret config).
- Do not flag purely stylistic preferences that don't affect behaviour.