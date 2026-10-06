# Architecture review: invoices module

Paths relative to `src/modules/invoices/` (fixture root: `.claude/skills/onion-architecture/evals/fixtures/invoices/`).

1. **service.ts:22-28 (with repository.ts:11-23) - `issue()` is not in a transaction.**
   `insertInvoice -> insertLines -> markIssued` are three separate writes. A failure after the first leaves an orphan draft invoice, or one with no lines, in the DB.
   Fix: open `db.transaction(async (tx) => {...})` in the service, or via a container-provided unit-of-work. Add an optional last `tx` parameter to `insertInvoice`, `insertLines` and `markIssued` and have them use `tx ?? db`. Repositories must never open the transaction themselves.

2. **repository.ts:2,12,18,22,27,33,37 - repository hard-imports the global `db` singleton.**
   Because of this, a `tx` handle cannot be passed (see 1). It also bypasses the container, so a test can only swap the repository by mocking the module.
   Fix: take the db handle in the constructor (`new InvoiceRepository(db)`), construct it in `platform/container.ts` as `invoiceRepo` with a `ContainerOverrides` slot, and accept the optional `tx` on each method.

3. **service.ts:8-19 - the job handler holds business logic.**
   The `jobs.register` callback computes subtotal, days late, months and the fee. The fee formula is 1.5% per month, capped at 20%. A job handler is a driving adapter and may only adapt the payload and call a service method.
   Fix: move the work into a service method such as `applyLateFees(now)`, with the pure fee rule in `helpers.ts` (`computeLateFee(subtotalCents, dueAt, now)`). The callback becomes `() => this.applyLateFees(this.clock.now())`. The pure rule can then be unit-tested with no mocks.

4. **service.ts:8 - the constructor registers the job as a side effect.**
   Every `new InvoicesService(...)` registers the handler again. Routes construct the service per `registerInvoiceRoutes` call, and tests construct it per test. Instantiation becomes hidden wiring.
   Fix: register jobs once at the composition/wiring point (an explicit `registerJobs()` called by app startup), not in a constructor.

5. **service.ts:9,14,26 - `new Date()` in a service.**
   The skill bans direct clock reads in `service.ts` and `helpers.ts`. The late-fee logic and `issuedAt` cannot be tested around a deadline.
   Fix: add a `Clock { now(): Date }` port in `vendor/shared/adapters.ts`, a `SystemClock` in `adapters/clock/system.ts`, a `FixedClock` in `adapters/mocks.ts`, and a container getter plus override slot. Pass `now` as a plain argument into the pure helper. The skill says to add the port when touching time-dependent logic under test, which applies here.

6. **service.ts:30-32 and routes.ts - `scheduleLateFees()` has no caller.**
   Nothing invokes it, so the job never runs. This is lower confidence, since a scheduler may live elsewhere in the full app. Confirm that the trigger exists and is wired at the composition root.

7. **service.test.ts:3-11 - the test mocks the module instead of injecting via the container.**
   `vi.mock('./repository.js')` couples the test to the import graph. It also fakes your own repository, which the skill says not to do. The `__mocks` export is unused. Only `issue()`'s return value is asserted. The test never checks call order, the late-fee path, or rollback.
   Fix: pass an object that satisfies the repository interface through `ContainerOverrides`. Better, add a `*.it.test.ts` against a real Postgres (testcontainers) covering atomicity of `issue()` and the late-fee job. Unit-test the pure fee helper with no mocks.

8. **routes.ts:16-18 - the route has no `schema.response`, and the body is cast manually.**
   The skill says new routes should declare `schema.response`, which is an output allowlist. `req.body as z.infer<...>` indicates the zod type provider is not applied. Use the `fastify-type-provider-zod` typed route so `req.body` is inferred.
   Fix: declare `schema: { body: IssueBody, response: { 201: z.object({ id: z.string().uuid() }) } }` and drop the cast. The `schema.body` zod object may not be validated at all if the compilers are not set, so confirm in `app.ts`.

9. **service.ts:1,7 - the service takes the whole `Container`.**
   This is low severity. The skill accepts it for existing services, but a new service should take only what it uses (`invoiceRepo`, `jobs`, `clock`). Doing so also removes the `as never` over-provisioning in the test (service.test.ts:23).

10. **repository.ts:11,25,32 / schema.ts - Drizzle row types leak out of the repository.**
    `insertInvoice`, `listOverdue` and `linesFor` return raw `$inferSelect` rows. The service consumes `inv.dueAt` and `l.amountCents` directly, and `lateFee` is a numeric string. This is low severity today because the route returns only `{ id }`. Map to domain or contract types at the boundary before the rows are used further.

Not flagged: `schema.ts` (no layering issue here; missing FK or index on `invoice_lines.invoice_id` and `workspace_id` is out of scope for this review, see `postgresql-table-design`).
