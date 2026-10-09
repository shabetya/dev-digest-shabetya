# Architecture review: invoices module

Files `src/db/client.js`, `src/platform/container.js` and `src/modules/_shared/context.js` are not in the fixture, so I did not read them.

1. **`service.ts:22-27` (with `repository.ts:11-23`): `issue()` is three separate writes with no transaction.**
   - `insertInvoice`, `insertLines` and `markIssued` run independently. If `insertLines` or `markIssued` fails, you are left with a `draft` invoice that has no lines, or lines that were never issued. The caller gets a 500 and the data is inconsistent.
   - Fix: add a unit-of-work or transaction boundary owned by the service layer. For example, `uow.run(async (tx) => { ... })` backed by `db.transaction`, with repository methods taking the tx.
   - Also have the insert create the invoice as `issued` directly, or make issue a single repository operation, so the extra `markIssued` write goes away.

2. **`repository.ts:2` (used at lines 12, 18, 22, 26, 33, 37): the repository imports the global `db` singleton.**
   - It can't join a transaction (this is the root cause of finding 1). It also can't be pointed at a test database or a different connection.
   - Fix: inject the executor, as `new InvoiceRepository(db)`, with methods accepting `tx = this.db`. Build it in the composition root.

3. **`service.ts:8-19`: the constructor registers a background job.**
   - Constructing a service has a side effect on `container.jobs`. `routes.ts:14` constructs the service once per route registration. A second construction (a test, or a second module) re-registers the job and either duplicates or throws.
   - The service also shouldn't know job wiring. Job registration is infrastructure and belongs in the composition root or a `jobs.ts` file.
   - Fix: make the service a plain class with a `applyLateFees(now)` method, and register the job in the bootstrap, with the handler calling `service.applyLateFees(new Date())`. Keep `scheduleLateFees` as a thin enqueue call.

4. **`service.ts:13-17`: the late-fee business rule is buried in an anonymous job closure.**
   - The 1.5% per month rate, the 20% cap and the 30-day month rounding are untestable without the job runner, the container and the database.
   - The money maths is done with floats (`subtotal * 0.015`). It then goes through `/100` and `toFixed(2)`, which gives rounding drift.
   - The unit is inconsistent: lines are stored in integer cents, but `lateFee` is stored as a decimal-string numeric in currency units (`schema.ts:9`, `repository.ts:36`).
   - Fix: extract a pure function such as `computeLateFee(lines, dueAt, now): number` (integer cents, `Math.round`) into `domain/late-fee.ts`, with unit tests on the boundaries. Store the fee in integer cents (`lateFeeCents`) to match `amountCents`.

5. **`service.ts:1-2, 7, 10-17, 23`: the service depends on the whole `Container` (service locator).**
   - It reaches into `container.invoiceRepo` and `container.jobs` and can see everything else in the container. The dependencies are hidden, and every test must build a container and cast it (`as never`).
   - `service.ts:2` also imports `NewLine` from `repository.ts`, so the application layer depends on the persistence adapter's types.
   - Fix: take explicit dependencies in the constructor, for example `new InvoicesService({ invoices: InvoiceStore, uow, clock })`. Define `InvoiceStore` as a port interface in the module's domain or application layer, with `NewLine` and `Invoice` types alongside it. `InvoiceRepository` then implements the port.

6. **`routes.ts:14`: the route layer constructs the service (`new InvoicesService(container)`).**
   - The HTTP adapter does composition, so the wiring is split between routes and the container.
   - Fix: build the service in the composition root and pass the built service (or `container.invoicesService`) to `registerInvoiceRoutes`.
   - Related: `routes.ts:18` uses `req.body as z.infer<...>`, which discards type safety. Use the Fastify Zod type provider so the body is typed from the schema.

7. **`service.test.ts:3-11, 20-24`: the test mocks module internals instead of injecting a fake.**
   - `vi.mock('./repository.js')` and `as never` couple the test to file paths and to the container shape. The mock repository returns only `{ id }`.
   - The only assertion is that the return value is `'inv-1'`. It never checks that lines were inserted, that the invoice was marked issued, or that a failure rolls back. The test would pass even if finding 1's bug were fixed incorrectly.
   - Nothing covers the late-fee logic (finding 4) at all. The job handler is registered into a `vi.fn()` that is never invoked.
   - Fix: once the ports exist, write the service tests against an in-memory fake implementing `InvoiceStore` and a fake `uow`. Assert state (the stored invoice is issued, its lines are present, nothing is persisted on failure). Unit-test `computeLateFee` directly. Test the repository against a real Postgres.

8. **`service.ts:10-12` (with `repository.ts:25-34`): the job does an N+1 and has no per-invoice isolation.**
   - It issues one `linesFor` query per overdue invoice. One failing invoice aborts the whole batch, and there is no transaction around each fee update.
   - Fix: have the repository return overdue invoices with line subtotals in one query (a join with `sum(amount_cents)`). Process each invoice in its own try or transaction.

9. **`schema.ts:15`: `invoice_lines.invoice_id` has no foreign key to `invoices.id`.**
   - Nothing at the database level stops orphan lines, which matters more because issuing is non-atomic today.
   - Fix: `.references(() => invoices.id, { onDelete: 'cascade' })` plus a migration. Also add an index on `invoice_lines.invoice_id` for `linesFor`.
