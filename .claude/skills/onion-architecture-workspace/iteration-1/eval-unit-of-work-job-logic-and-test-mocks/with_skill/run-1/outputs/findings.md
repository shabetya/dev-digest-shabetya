# Architecture review: `invoices` module

1. **No transaction around the issue sequence** - `src/modules/invoices/service.ts:24-26` (`insertInvoice -> insertLines -> markIssued`).
   These are three independent writes. A failure after the first leaves an invoice with no lines, or with lines but still `draft`. The service is the unit of work, so it must own the transaction.
   Fix: wrap the three calls in `db.transaction(async (tx) => {...})` inside `issue()`. Add an optional trailing `tx` parameter to each repository method. Better still, insert the invoice with `status: 'issued'` and `issuedAt` set, so `markIssued` is not a separate write.

2. **Repository hard-wires the global `db` singleton, so a transaction cannot be passed in** - `src/modules/invoices/repository.ts:2` (used at lines 12, 18, 22, 26, 33, 37).
   Every method calls the module-level `db`. Finding 1 cannot be fixed until the repository can accept a caller-owned handle. It also couples the persistence adapter to an import instead of the composition root.
   Fix: take `db` in the constructor (built in `platform/container.ts`) and give each write method an optional last parameter `tx: Tx = this.db`. Repositories must never call `db.transaction()` themselves.

3. **Business rule lives inside the job handler** - `src/modules/invoices/service.ts:8-19`.
   The `jobs.register` callback is a driving adapter. It should only adapt the payload and call a service method. Here it holds the late-fee policy: the 1.5%/month rate, the 20% cap, the days-to-months rounding, and the cents-to-string conversion. It also does an N+1 (`linesFor` per invoice) and uses float arithmetic on money (`subtotal * 0.015`), which is a correctness risk.
   Fix:
   - Add a service method `applyLateFees(now: Date)`.
   - Move the calculation into a pure `computeLateFee(subtotalCents, daysLate)` in `helpers.ts`. Use integer cents and an explicit rounding step.
   - Put the rate, cap and the 30-day/86_400_000 figures in `constants.ts`.
   - Make the job callback a one-liner: `() => this.applyLateFees(new Date())`.
   - Have the repository fetch overdue invoices with their subtotals in one query, or run the fee updates in a transaction.

4. **Service registers a job as a constructor side effect, and the route instantiates the service** - `src/modules/invoices/service.ts:8` and `src/modules/invoices/routes.ts:14`.
   Registration happens whenever `new InvoicesService(...)` runs. Any second construction (a test, another caller) re-registers `LATE_FEE_JOB`. `scheduleLateFees()` (`service.ts:30`) has no caller or route, so the job is dead code as written.
   Fix: register the handler once, explicitly, at the composition root. Follow the repo's pattern of registering from a `register`/`init` step rather than the constructor. Have `routes.ts` receive or obtain the service from the container instead of `new`-ing it. Decide who calls `scheduleLateFees()` (a cron or a route), and wire that.

5. **Unit test mocks the module instead of injecting a fake via the container** - `src/modules/invoices/service.test.ts:3-11` (`vi.mock('./repository.js')`).
   Module-level mocking ties the test to the import graph. It also fakes our own repository, which is the wrong thing to fake: the shape of the writes is what needs a real test. The `__mocks` export is never used, and `container` is cast with `as never`. The test covers only the happy path of `issue()` and asserts nothing about the repository calls. It misses the job and fee rule, which is where the risk is.
   Fix:
   - Move the fee calculation into a pure helper and unit-test it with no mocks.
   - Cover `issue()` and `applyLateFees` with a `*.it.test.ts` against real Postgres, including a rollback case.
   - Where a seam is needed, pass an object that satisfies the interface through `ContainerOverrides` instead of `vi.mock`.

6. **Drizzle row types leak out of the repository** - `src/modules/invoices/repository.ts:12-14, 25-30, 32-34`.
   `insertInvoice` returns the raw `$inferSelect` row (`row!`), and `listOverdue` / `linesFor` return raw rows. `service.ts` consumes them directly (`inv.dueAt`, `l.amountCents`). The service logic is now bound to the physical schema, so a column rename ripples into business code.
   Fix: return domain-shaped types (for example `{ id, dueAt }` and `{ amountCents }`), mapped inside the repository or in `helpers.ts`. Have `insertInvoice` return just the id, since that is all `issue()` uses.

7. **Route does not use a typed schema or declare a response** - `src/modules/invoices/routes.ts:16-18`.
   The handler casts `req.body as z.infer<typeof IssueBody>`, which means the type provider is not inferring the body type. It also declares no `schema.response`, so there is no output allowlist.
   Fix: use `fastify-type-provider-zod` so the body type is inferred and the cast goes away. Add `schema.response: { 201: z.object({ id: z.string().uuid() }) }`. Move `IssueBody` to a module `types.ts` or schema file if another caller will need it.

8. **Low: new service takes the whole `Container`** - `src/modules/invoices/service.ts:7`.
   It uses only `jobs` and `invoiceRepo`. A wide dependency hides what the class touches, and it is why the test has to cast a partial object `as never`.
   Fix: take `{ repo: InvoiceRepository, jobs: JobRunner }` through the constructor.
