/**
 * Built-in skill bodies used by the seed. A skill body is a directive markdown
 * rule injected verbatim into `## Skills / rules` for any agent it's linked to
 * (see reviewer-core/src/prompt.ts) — unlike an agent's system prompt, it does
 * NOT restate the severity/verdict/output-shape conventions (those come from
 * the agent prompt); it only states the rule itself, directively.
 */

export const FRONTEND_CONVENTIONS_SKILL = `# Frontend review conventions
Apply these rules only to changed frontend files (React/Next.js components,
hooks, client-side TypeScript — files under a \`client/\`, \`components/\`, or
\`app/\` directory, or ending in \`.tsx\`).

- Flag any data fetch made directly with \`fetch()\` inside a component instead
  of going through the project's data hook layer.
- Flag a new component whose state/props are managed with more than a couple of
  independent \`useState\` calls where a single \`useReducer\` would be clearer.
- Flag a list rendered without a stable, unique \`key\` (array index used as key
  on a list that can reorder or filter).
- Flag a component that swallows a loading or error state from a query hook
  instead of rendering it (blank screen on error/loading is a real UX bug).
- Do not flag purely stylistic preferences that don't affect behaviour.`;

export const BACKEND_CONVENTIONS_SKILL = `# Backend review conventions
Apply these rules only to changed backend files (Fastify routes, services,
repositories, or other server-side TypeScript — files under a \`server/\` or
\`api/\` directory).

- Flag any route handler that reads request data without going through a
  declared Zod \`params\`/\`body\`/\`querystring\` schema on the route.
- Flag a database query missing a workspace/tenant scope filter — every row
  read or written must be scoped to the caller's workspace.
- Flag a multi-statement write (more than one dependent insert/update) that
  isn't wrapped in a transaction.
- Flag a secret, API key, or credential read from anywhere other than the
  project's secrets provider (never hardcoded, never read from a generic env
  var helper meant for non-secret config).
- Do not flag purely stylistic preferences that don't affect behaviour.`;

export const TEST_QUALITY_RUBRIC_SKILL = `# Test quality rubric
When a diff adds or changes tests for a function, check that the tests cover:

1. The happy path (at least one passing case).
2. At least one edge case — an empty/zero/null/boundary input, or the specific
   limit the function enforces (e.g. "at the limit" and "one past the limit").
3. At least one error/failure path, when the function under test can throw,
   reject, or return a failure result.

If a changed function clearly has branches beyond the happy path and the diff's
tests only cover the happy path, that is a real gap — flag it, name the missing
branch, and suggest the specific test case that would cover it.`;
