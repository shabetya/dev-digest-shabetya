# Architecture review: notifications module

Paths relative to `fixtures/notifications/`.

1. **HIGH - `src/modules/notifications/service.ts:1,7` - application service instantiates the Slack SDK directly.**
   `WebClient` from `@slack/web-api` is built as a field initializer, so the vendor SDK sits inside the application ring. There is no port, no adapter and no test double, so the service cannot be tested without Slack. A Slack API change lands in the service.
   Fix:
   - Define a `Notifier` port (for example `send(recipient, text): Promise<void>`) in `vendor/shared/adapters.ts`. Write it in the caller's vocabulary, not Slack's.
   - Implement it in `adapters/slack/web-api.ts`, with the SDK types confined to that file.
   - Add a fake in `adapters/mocks.ts`.
   - Add a lazy `notifier` getter and a `notifier?` slot in `ContainerOverrides` in `platform/container.ts`.
   - The service then calls `this.container.notifier.send(...)`.

2. **HIGH - `src/modules/notifications/service.ts:7` - `process.env.SLACK_BOT_TOKEN` is read outside the two allowed files.**
   Only `platform/config.ts` and `adapters/secrets/local.ts` may read `process.env`. The token is a secret, so it also bypasses `SecretsProvider`. The `WebClient` is also built at construction time, so a missing token is not handled lazily.
   Fix: read the token in the Slack adapter through `secrets.get('SLACK_BOT_TOKEN')`. `LocalSecrets` already falls back to the env. Build the client lazily, and have the container pass `this.secrets` to the adapter. Do not add the token to `AppConfig`.

3. **HIGH - `src/modules/notifications/service.ts:3,14` and `src/platform/container.ts` (whole file) - cross-module import, and `container.usersRepo` does not exist.**
   - The service imports `../users/service.js` and builds `new UsersService(this.container)` on every call. That couples two modules at source level.
   - `UsersService` calls `this.container.usersRepo.findOwner` (`users/service.ts:13`), but `Container` has no `usersRepo` getter and `ContainerOverrides` has no slot for one. This will not typecheck.
   Fix:
   - Add `usersRepo` (and a `ContainerOverrides.usersRepo` slot) to `container.ts`. The users entity is shared, so the container should build it.
   - Notifications should call `this.container.usersRepo.findOwner(workspaceId)` directly, or go through a container-exposed `usersService`. Remove the sibling import.
   - `UsersService.getOwner` is a pure pass-through. If nothing else uses it, delete it rather than keep the ceremony.

4. **MEDIUM - `src/modules/notifications/routes.ts:12-16` - the 202 "queued" response is false.**
   The handler awaits `notifyReviewDone`, which makes the Slack HTTP call inline. A Slack outage or slowness blocks the request, and `{ queued: true }` is not what happened.
   Fix: register a job in `platform/jobs.ts` and have the service call `enqueue`. The registered callback should only adapt the payload and call the service method. Retries and timeouts then live in the job runner and the adapter, not in the service. If you want synchronous behaviour instead, return 200 and map Slack failures to `ExternalServiceError`.

5. **MEDIUM - `src/modules/notifications/routes.ts:12,14` - validation is only half schema-first, and no response schema is declared.**
   - The cast `req.params as z.infer<typeof Params>` suggests the zod type provider is not driving the handler types.
   - There is no `schema.response`, so there is no output allowlist.
   Fix: use the route generic or the `fastify-type-provider-zod` typed app so `req.params` is inferred without a cast. Add `response: { 202: z.object({ queued: z.literal(true) }) }`.

6. **MEDIUM - `src/platform/config.ts:6` - `z.coerce.boolean()` makes `NOTIFICATIONS_ENABLED=false` evaluate to `true`.**
   Coercion applies `Boolean("false")`, which is `true`. The flag read in `service.ts:12` can never be turned off through the environment, which defeats the config chokepoint.
   Fix: use `z.enum(['true','false']).default('true').transform(v => v === 'true')`, or `z.stringbool()` on Zod 4.

7. **LOW - `src/modules/notifications/service.ts:9` - new service takes the whole `Container`.**
   The service needs only `config.NOTIFICATIONS_ENABLED`, `reviewRepo`, the users lookup and the notifier. A new service should take those capabilities as constructor arguments, so its dependencies show in its signature and its tests do not over-provision. This is low priority because existing services already follow the whole-container pattern, but it is easy to get right in new code.

Checked and fine: `helpers.ts` is pure; `adapters/secrets/local.ts` is an allowed `process.env` reader; the route uses `getContext` and passes `workspaceId` down; the route does no DB access.
