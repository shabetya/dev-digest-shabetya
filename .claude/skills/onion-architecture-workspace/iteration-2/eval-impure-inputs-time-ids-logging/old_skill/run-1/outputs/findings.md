# Architecture review: `modules/reminders` (onion-architecture v1.0.0)

Paths are relative to `.claude/skills/onion-architecture/evals/fixtures/reminders/src/modules/reminders/`.

1. **helpers.ts:13 - the "pure" core helper reads the clock.**
   `isDue` calls `Date.now()`. `helpers.ts` is domain core and must be pure. The skill's adapter test says clock and randomness leave the process. The unit test for `isDue` can't pin time without fake timers.
   Fix: change the signature to `isDue(row, now: Date)`. The service passes a time from an injected clock (see #2).

2. **service.ts:9 and service.ts:25 - the service creates its own randomness and time.**
   `randomUUID()` (line 9) and `new Date()` (line 25) are ambient, so `create` and `dispatchDue` can't be tested deterministically. The skill says to define the port first, add a mock, and wire it in `container.ts`. Both are process-leaving capabilities that belong behind ports.
   Fix: add `Clock { now(): Date }` and `IdGenerator { newToken(): string }` ports in `vendor/shared/adapters.ts`, or a module `types.ts`. Add system implementations under `adapters/` and test doubles in `adapters/mocks.ts`. Wire them as lazy getters in `platform/container.ts` with `ContainerOverrides` slots. In the service, use `this.container.clock.now()` and `this.container.ids.newToken()`. Pass `now` into `isDue` and `markSent`.

3. **service.ts:26 - `console.log` in the service, and it logs a user email.**
   This is an ambient side-channel in the application layer. It can't be asserted on or silenced in tests. It also writes PII (`user.email`) to stdout.
   Fix: inject a logger (container or Fastify logger passed as a capability) and log only `row.id`. Drop the email.

4. **routes.ts:8 and routes.ts:23 - `DispatchParams` validates a param the route doesn't have.**
   `POST /reminders/dispatch` has no `:workspaceId` segment. The schema requires `params.workspaceId` as a uuid, so a correct request would fail validation (422). It is also redundant: tenancy must come from `getContext` (line 24), not from the client.
   Fix: delete `DispatchParams` and the `params` schema. If a schema is wanted, use an empty or no params schema.

5. **routes.ts:26 - business outcome decided in the handler, with the wrong error.**
   "Nothing was due" is a normal result, not "not found". Throwing `NotFoundError` turns a successful no-op into a 404 and puts a rule in the driving adapter. Handlers should be parse, resolve context, delegate, map.
   Fix: return `{ sent: 0 }` with 200. If a rule is really needed, put it in the service.

6. **routes.ts:16-19 - `userId` is taken from the request body.**
   The skill says every route resolves tenancy through `getContext`. A caller can create reminders for any user id, including users outside the workspace. The service and repo never check membership.
   Fix: take `userId` from `ctx` (the authenticated user). If creating for others is intended, have the service verify the user belongs to `workspaceId`.

7. **routes.ts:11-27 - no `schema.response` on any route.**
   The skill treats the output allowlist as a security boundary. It matters here because `create` returns `cancelToken` (a capability secret) and nothing enforces the response shape. Line 18 also hand-casts `req.body` instead of using the zod type provider.
   Fix: declare a zod `response` schema per route (200 and 201), and let the type provider infer `req.body`. Remove the `as` cast.

8. **repository.ts:2 and every method - repository imports the global `db` singleton and takes no transaction handle.**
   The repository reaches for an ambient `db`, so it can't be built with a different handle or take part in a caller-owned unit of work. The skill says the caller owns the transaction and the repository receives it as an optional last parameter.
   Fix: take the `db` handle in the constructor, built in the container. Add an optional `tx` last parameter to the write methods (`insert`, `markSent`, `cancel`). Today `dispatchDue` calls `markSent` per row with no transaction, so a failure mid-loop leaves a partial state. Decide whether each row or the whole batch is the unit of work.

9. **service.ts:6 - a new service takes the whole `Container`.**
   The skill says existing services may, but a new one should take only the capabilities it uses. This one uses `reminderRepo`, `usersRepo`, `mailer`, and (after #2 and #3) a clock, id generator, and logger.
   Fix: use a constructor of `{ reminderRepo, usersRepo, mailer, clock, ids, logger }`, built in `container.ts`.
