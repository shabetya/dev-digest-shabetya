# Architecture review: notifications module (onion-architecture v1.0.0)

Paths are relative to `.claude/skills/onion-architecture/evals/fixtures/notifications/`.

1. **`src/modules/notifications/service.ts:1,7` - Slack SDK constructed inside the application service, and `process.env` read outside the config chokepoint.**
   The service imports `@slack/web-api` and does `new WebClient(process.env.SLACK_BOT_TOKEN)`. This breaks three rules at once. A driven adapter (network call) lives in a service. Only `platform/config.ts` and `adapters/secrets/local.ts` may read `process.env`. A bot token is a secret and must come through `SecretsProvider`. It also can't be tested without mocking the module or hitting Slack.
   Fix:
   - Add a port `Notifier` (for example `notifyUser(recipientId, text)`) in `vendor/shared/adapters.ts`, or in the module's `types.ts`, in the caller's vocabulary.
   - Implement it in `adapters/notifier/slack.ts`. That file owns the `WebClient`, and gets the token from `container.secrets.get('SLACK_BOT_TOKEN')`. Build the client lazily.
   - Add a mock in `adapters/mocks.ts`.
   - Add a lazy `notifier` getter and a `notifier?` slot in `ContainerOverrides` in `platform/container.ts`.
   - Make the service call `this.container.notifier.notifyUser(...)`.

2. **`src/modules/notifications/service.ts:3,14` - Cross-module import and service instantiation.**
   `notifications` imports `../users/service.js` and does `new UsersService(this.container)`, which couples the two domains at the source level. Cross-module access must go through the container.
   Fix: expose the users capability on the container (for example `container.usersRepo`, or a narrow `container.users` facade), and call that. Remove the import.

3. **`src/modules/users/service.ts:13` together with `src/platform/container.ts:6-24` - `container.usersRepo` does not exist.**
   `UsersService` calls `this.container.usersRepo.findOwner`, but `Container` has no `usersRepo` getter and `ContainerOverrides` has no slot for it. The code doesn't typecheck, and nothing in the module can be wired or overridden in tests. Finding 2's fix depends on this.
   Fix: add a `usersRepo` lazy getter and an override slot in the container. The repository is shared across modules, so construct it there, as `reviewRepo` already is.

4. **`src/modules/notifications/routes.ts:15-16` - Request returns "queued" but does the Slack call inline.**
   The handler awaits `notifyReviewDone`, which makes the network call to Slack, then replies `202 {queued: true}`. Nothing is queued. Request latency and Slack failures now leak into the HTTP layer. Scheduling is also not hidden behind the `enqueue` port.
   Fix: have the service enqueue the work through the jobs port (`container.jobs.enqueue(...)`). Register a job handler that adapts the payload and calls a service method. Or return 200 and stop calling it "queued". If Slack is flaky, retries and timeouts belong in the adapter (`platform/resilience.ts`), not the service.

5. **`src/modules/notifications/service.ts:12` - Feature flag read through the container's config in the service body.**
   This is acceptable on its own, since config is reached via the container and can be overridden. But the flag silently turns the endpoint into a no-op that still returns 202 from the route (`routes.ts:16`). The gating decision should be visible to the caller.
   Fix: either skip registering the route when `container.config.NOTIFICATIONS_ENABLED` is false (composition-root decision), or return a result the route maps to a status. Lower priority.

6. **`src/modules/notifications/routes.ts:12` - No `schema.response` declared.**
   New routes should declare a response schema as an output allowlist. Fix: add `response: { 202: z.object({ queued: z.boolean() }) }`. Lower priority.

Checked and fine: `helpers.ts` is pure and correctly placed. `adapters/secrets/local.ts` reading `process.env` is one of the two allowed places. `config.ts` is the correct env chokepoint. `routes.ts` uses `getContext` and passes `workspaceId` down, and has no DB access.
