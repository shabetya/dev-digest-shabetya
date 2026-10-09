# Architecture review: notifications module

1. **src/modules/notifications/service.ts:1,7,17 - Vendor SDK used directly in the service.**
   `@slack/web-api` is imported and a `WebClient` is built inside the service, so business logic is tied to Slack and cannot be unit-tested without the network.
   Fix: define a `Notifier` port (e.g. `send(recipient, text)`) in the shared adapters contracts. Implement it in `src/adapters/notifications/slack.ts`, the only file that imports `@slack/web-api`. Expose it from `Container` with an override slot, and have the service call `notifier.send(...)`.

2. **src/modules/notifications/service.ts:7 - Secret read from `process.env` inside the service.**
   `process.env.SLACK_BOT_TOKEN` bypasses `config.ts` and the `SecretsProvider` (`container.secrets`), the project's secrets path. The client is also built in a field initializer, so it is created when the routes register.
   Fix: the Slack adapter takes the token via its constructor. The composition root reads it from `secrets.get('SLACK_BOT_TOKEN')`. The service never touches env.

3. **src/modules/notifications/service.ts:14 - Service constructs another module's service.**
   `new UsersService(this.container)` hard-wires a cross-module dependency and builds a new instance on every call.
   Fix: inject a narrow dependency through the constructor, e.g. `ownerLookup: { getOwner(workspaceId) }`. Wire it in the container or composition root.

4. **src/modules/users/service.ts:13 - `container.usersRepo` does not exist.**
   `Container` (container.ts:11-24) defines only `secrets` and `reviewRepo`, so this will not compile and the owner lookup has no provider. The `UsersService` wrapper adds nothing over the repo call.
   Fix: add a `UsersRepository` (or port) to the container, with an override slot like the others. Inject it into `UsersService` by its repo type, not via the whole container.

5. **src/modules/notifications/service.ts:9 and src/modules/users/service.ts:10 - Whole `Container` injected into services (service locator).**
   Hidden dependencies make the service signature meaningless, and tests must fake the entire container.
   Fix: take only what is needed, e.g. `constructor(deps: { config: Pick<AppConfig,'NOTIFICATIONS_ENABLED'>; reviews: ReviewReader; owners: OwnerLookup; notifier: Notifier })`.

6. **src/platform/container.ts:4,8,21 and src/modules/notifications/service.ts:15 - Depends on the concrete `ReviewRepository` class from another module.**
   The container and override types use the class, not an interface. Notifications only needs `get(reviewId)`.
   Fix: declare a small `ReviewReader` port, or a repository interface owned by the consumer. Let `ReviewRepository` implement it.

7. **src/platform/container.ts:17-23 - Getters build a new instance on every access.**
   Each `container.secrets` or `container.reviewRepo` creates a fresh object, and `LocalSecrets` re-reads and parses the secrets file on every `get`. Singletons and shared state such as a DB handle are impossible.
   Fix: construct once, in the constructor or lazily and memoized: `this.secrets = overrides.secrets ?? new LocalSecrets()`.

8. **src/modules/notifications/routes.ts:10 - Route layer builds the service.**
   `new NotificationsService(container)` is composition inside the HTTP layer, so routes cannot be tested with a stub service.
   Fix: build the service in the composition root (container) and have `registerNotificationRoutes` receive it.

9. **src/modules/notifications/routes.ts:15-16 and service.ts:12 - 202 "queued" reply is false.**
   The route awaits the Slack call inline, then returns `{queued:true}`, even when the flag is off and the service silently returns. Slack latency and failures also hit the request thread.
   Fix: either return 200 with the real outcome, or enqueue the work on a job and have the service return a status such as `'sent' | 'disabled'`.

10. **src/platform/config.ts:6 - `z.coerce.boolean()` mis-parses env strings.**
    `NOTIFICATIONS_ENABLED=false` coerces to `true` because any non-empty string is truthy, so the kill switch cannot be turned off through env.
    Fix: `z.enum(['true','false']).default('true').transform(v => v === 'true')`.
