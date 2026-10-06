# Architecture review: invoices module (onion-architecture v1.0.0)

Paths are relative to `.../evals/fixtures/invoices/`.

1. **`src/modules/invoices/service.ts:22-27` (with `repository.ts:11-23`): `issue()` is a multi-step write with no transaction.**
   `insertInvoice -> insertLines -> markIssued` are three independent statements. If `insertLines` fails, an invoice with no lines is left behind in `draft`. If `markIssued` fails, a fully-lined invoice is stuck in `draft`.
   Fix: the service owns the unit of work. Wrap the sequence in `db.transaction(async (tx) => { ... })` and pass `tx` as an optional last parameter to `insertInvoice`, `insertLines` and `markIssued`. The repository must never open the transaction itself.

2. **`src/modules/invoices/repository.ts:2` and every method (lines 12, 18, 22, 26, 33, 37): the repository imports the global `db` singleton.**
   This is the cause of finding 1. There is no way to hand the repository a transaction handle, and the DB is not injected. `markIssued`, `setLateFee` and the two inserts all need an optional `tx` parameter. They should use `(tx ?? this.db)`, and the `db` should be a constructor argument supplied by the container.
   Related: `insertInvoice` (line 13) and `listOverdue` (line 26) return raw Drizzle rows to the service. Keep row types behind the repository boundary and map to a domain or contract type.

3. **`src/modules/invoices/service.ts:8-19`: the job handler holds business rules.**
   The callback registered with `jobs.register` computes subtotal, days late, months (`ceil(daysLate/30)`), the 1.5%/month rate, the 20% cap and the cents-to-decimal conversion. A job handler is a driving adapter and may only adapt the payload and call a service. The late-fee policy is a business rule and cannot be tested or reused without driving the job.
   Fix:
   - Add a pure `calculateLateFee(subtotalCents, dueAt, now)` in `modules/invoices/helpers.ts`, with constants in `constants.ts` (`LATE_FEE_RATE`, `LATE_FEE_CAP`, `DAYS_PER_PERIOD`, job name). Unit-test it with no mocks.
   - Add an `applyLateFees(now)` method on the service that does the loop and the repository calls.
   - Reduce the registered callback to `() => this.applyLateFees()`.

4. **`src/modules/invoices/service.ts:7-9`: the constructor has a side effect, and `routes.ts:14` triggers it.**
   `registerInvoiceRoutes` does `new InvoicesService(container)`, and that registers a job. Constructing the service a second time, for example in a test or in another caller, re-registers the job. Job registration is composition-root or wiring work.
   Fix: register the job where the other modules do it (an explicit `registerJobs()` method called once from the composition root). Or make the constructor pure and have routes receive an already-built service.
   Separately, `constructor(private container: Container)` takes the whole container. That is acceptable for an existing-style service, but a new service should take only `invoiceRepo` and `jobs`. This would also make the test setup honest.

5. **`src/modules/invoices/service.test.ts:3-11`: the test mocks your own repository module with `vi.mock('./repository.js')`.**
   Module-level mocking ties the test to the import graph. The skill says to inject through `ContainerOverrides` and to fake other people's services, not your own repository. The hand-rolled `as never` container cast (line 22) also bypasses type checking against the real `Container`.
   The test asserts only the returned id (line 29). It would still pass if `insertLines` or `markIssued` were never called or were called in the wrong order. It covers neither the atomicity gap (finding 1) nor the late-fee logic (finding 3).
   Fix:
   - Add an `invoiceRepo` override slot to `ContainerOverrides` and inject a real or in-memory object that satisfies the interface.
   - Unit-test `calculateLateFee` as a pure function.
   - Add `invoices.it.test.ts` that runs `POST /invoices` against a real Postgres (Testcontainers). It should assert that lines are persisted, the status is `issued`, and a failure mid-way leaves no rows.
   - DB-backed tests must use the `*.it.test.ts` suffix so they run in the integration lane.

6. **`src/modules/invoices/service.ts:9, 26`: `new Date()` is called directly inside the service and the job.**
   The clock leaves the process, so it is an external dependency. Time-dependent logic (overdue selection, `daysLate`, `issuedAt`) is hard to pin in tests. Take `now` as a parameter (the repository already does for `listOverdue(now)`), or inject a clock. The job callback then passes `now` into `applyLateFees(now)`. This is low severity and follows naturally from fixing finding 3.

7. **`src/modules/invoices/routes.ts:16-21`: the route has no `schema.response` and casts the body.**
   `req.body as z.infer<typeof IssueBody>` is a manual cast. Use `fastify-type-provider-zod` typing so the handler gets inferred types. The route also declares no `schema.response`, so there is no output allowlist. Declare `{ 201: z.object({ id: z.string().uuid() }) }`. This is low severity, and the rest of the handler (parse, context, delegate, map) is correctly thin.

Checked and fine: `routes.ts` does not import drizzle or the schema, and tenancy goes through `getContext`.
