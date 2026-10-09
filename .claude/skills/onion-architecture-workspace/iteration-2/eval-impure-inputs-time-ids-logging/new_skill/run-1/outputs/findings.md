# Architecture review: modules/reminders

1. **service.ts:26 - `console.log` in a service, and it logs `user.email` (PII).**
   `console.*` bypasses redaction, levels and request correlation.
   Fix: inject a `Logger` (from the container) and log ids only, e.g. `logger.info({ reminderId: row.id }, 'reminder sent')`. Drop the email.

2. **service.ts:25 - `new Date()` in an application service.**
   The sent-at timestamp cannot be pinned in a test.
   Fix: add a `Clock { now(): Date }` port in `vendor/shared/adapters.ts`, `SystemClock` in `adapters/clock/system.ts`, `FixedClock` in `adapters/mocks.ts`, and a lazy getter plus `ContainerOverrides` slot in `platform/container.ts`. Call `clock.now()` in the service.

3. **helpers.ts:13 - `Date.now()` inside the pure helper `isDue`.**
   Time is banned in `helpers.ts`; it makes a pure function non-deterministic.
   Fix: `isDue(row, now: Date)`; the service passes `this.clock.now()` (read once per dispatch run).

4. **service.ts:1,9 - `randomUUID()` in the service (cancel token).**
   Output cannot be asserted.
   Fix: inject an `IdGenerator`/token port (deterministic mock in `adapters/mocks.ts`), or let the repository/DB generate the token (`defaultRandom()`).

5. **routes.ts:18 - hand-cast `req.body as z.infer<...>` instead of the type provider.**
   Validation is declared, but the handler re-asserts the type by hand.
   Fix: use `fastify-type-provider-zod` so `req.body` is typed from `schema.body`; remove the cast.

6. **routes.ts:7,19 - `userId` accepted from the request body.**
   A caller can create reminders for any user in the workspace; ownership/tenancy is not derived from the resolved context.
   Fix: take the user from `getContext` (or verify the user belongs to `ctx.workspaceId` in the service).

7. **routes.ts:8,23 - `DispatchParams` schema on a route with no path params.**
   It validates nothing and is misleading (workspace already comes from `getContext`).
   Fix: remove `schema.params`.

8. **routes.ts:26 - `NotFoundError` for "nothing due".**
   Zero due reminders is an expected outcome, not a missing resource; the handler turns a successful no-op into a 404.
   Fix: return `{ sent: 0 }` with 200.

9. **routes.ts:11-28 - no `schema.response` on any route.**
   `create` returns the one-time `cancelToken`, and there is no output allowlist anywhere.
   Fix: declare zod response schemas (DTO types from shared contracts) for each route.

10. **repository.ts:2,7,14,22,26 - global `db` singleton; no way to join a transaction.**
    The caller cannot own the unit of work (`dispatchDue` does send + `markSent` per row with no atomicity).
    Fix: inject `db` via the constructor, accept an optional trailing `tx` parameter on write methods, and open `db.transaction()` in the service where several writes form one unit.

11. **repository.ts:6,13 / helpers.ts:1-6 - Drizzle rows leak out of the repository and a hand-written `ReminderRow` mirrors the schema.**
    The repository returns raw `$inferSelect` rows, and the service also reads `cancelToken`/`workspaceId` that the `ReminderRow` interface omits.
    Fix: map to a domain/contract type inside the repository and have helpers consume that type.

12. **service.ts:6,23-24 - new service takes the whole `Container` and reaches `usersRepo` and `mailer` through it.**
    A wide dependency hides what the class touches and over-provisions tests.
    Fix: constructor-inject only `reminderRepo`, `usersRepo`, `mailer`, `clock`, `logger`, `ids`.

13. **service.ts:20-22 - "is due" filtered in memory after loading all pending rows.**
    The rule belongs in the query.
    Fix: add `listDue(workspaceId, now)` to the repository, filtering on `due_at`.

14. **repository.ts:25 - `cancel` has no service method or route.**
    Dead code, or the cancel flow is missing from this PR (the token is issued but never usable).
    Fix: add the service method and route, or remove it.
