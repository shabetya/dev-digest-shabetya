# Architecture review: notifications module

Paths are relative to `.claude/skills/onion-architecture/evals/fixtures/notifications/`.

1. **`src/modules/notifications/service.ts:1,7,17` - application service depends directly on the Slack SDK (outward dependency).**
   `NotificationsService` imports `@slack/web-api`, builds a `WebClient` as a field initializer and calls `chat.postMessage`. A driven adapter sits inside the service, and the vendor model (`channel`, `chat.postMessage`) leaks into orchestration. The service cannot be tested without Slack.
   Fix: define a port in `vendor/shared/adapters.ts`, e.g. `NotificationSender { send(recipientId: string, text: string): Promise<void> }`, in the caller's vocabulary. Implement it in `adapters/notifications/slack.ts` so the `WebClient` stays in that file. Add a `FakeNotificationSender` to `adapters/mocks.ts`. Add a lazy getter `container.notifier` and a `notifier?` slot in `ContainerOverrides`. The service then calls `this.container.notifier.send(owner.slackId, text)`.

2. **`src/modules/notifications/service.ts:7` - reads `process.env.SLACK_BOT_TOKEN` outside the allowed chokepoints, and a secret is read as raw env.**
   Only `platform/config.ts` and `adapters/secrets/local.ts` may read `process.env`. The bot token is a secret, so it belongs behind `SecretsProvider`. Reading it in a field initializer also means the app demands the token at construction and tests cannot supply one.
   Fix: remove the env read from the service. The Slack adapter from #1 receives the token from `container.secrets.get('SLACK_BOT_TOKEN')`. Build the adapter in a lazy container getter so a missing key only fails when notifications are used.

3. **`src/modules/notifications/service.ts:3,14` - cross-module source import, and a service instantiated inside a method.**
   `import { UsersService } from '../users/service.js'` couples two domains at the source level. `new UsersService(this.container)` is also created on every call, which bypasses the container. The notifications module also imports `WorkspaceOwner` indirectly through `users/service.ts`.
   Fix: expose the users capability through the container, e.g. `container.usersRepo` or `container.users`. Call that from `NotificationsService`, and drop the `../users/` import.

4. **`src/modules/users/service.ts:13` together with `src/platform/container.ts:11-24` - the code references a container member that does not exist.**
   `this.container.usersRepo.findOwner` is called, but `Container` has no `usersRepo` getter and no override slot. This does not typecheck, and it shows the users dependency was never wired. `UsersService` is also a pass-through that only forwards to the repository.
   Fix: add a `usersRepo` lazy getter and a `usersRepo?` override in `ContainerOverrides`, constructed once in the container. Then either have notifications call the repo directly, which makes the pass-through `UsersService` unnecessary, or keep the service and expose it from the container.

5. **`src/modules/notifications/routes.ts:12-16` - the handler reports `202 { queued: true }` but nothing is queued.**
   `await service.notifyReviewDone(...)` runs the Slack call inline in the request, so a slow or failing Slack call blocks or fails the request. The response says "queued", which is false. Deferred work belongs behind the `enqueue` port.
   Fix: register a job in the service (the callback is only an adapter that calls a service method) and have the route call `enqueue`. Or, if synchronous is intended, return 200 or 204 and let `ExternalServiceError` surface through the central error handler. The Slack adapter should map vendor errors to `ExternalServiceError`.

6. **`src/modules/notifications/routes.ts:12,14` - the route has no `schema.response`, and params are re-cast by hand.**
   The route declares only `schema.params`. A response allowlist is a security boundary and new routes should declare one. `req.params as z.infer<typeof Params>` is a manual cast, so the zod type provider is not doing the typing.
   Fix: add `schema.response: { 202: z.object({ queued: z.literal(true) }) }` and use the zod type provider (`app.withTypeProvider<ZodTypeProvider>()`) so `req.params` is typed without the cast.

7. **`src/platform/config.ts:6` - `z.coerce.boolean()` makes the feature flag impossible to turn off.**
   `NOTIFICATIONS_ENABLED=false` is coerced from the non-empty string `"false"` to `true`. The flag the service checks at `service.ts:12` therefore never disables anything.
   Fix: parse explicitly, e.g. `z.enum(['true','false']).default('true').transform(v => v === 'true')`.

8. **`src/modules/notifications/service.ts:6-9` - a new service takes the whole `Container`.**
   `constructor(private container: Container)` hides that the service needs only config, the review repo, the users capability and the notifier. This is the existing repo convention, so it is low severity, but a new service should take the capabilities it uses.
   Fix: take `{ enabled: boolean, reviews: ReviewRepository, users: ..., notifier: NotificationSender }` in the constructor and have `routes.ts` build it from the container.
