# Billing module: architecture review (onion-architecture v1.0.0)

Paths are relative to `.../fixtures/billing/src/`.

1. **`modules/billing/service.ts:24-39` (HIGH): the Stripe charge and the `runBus.emit` happen inside `db.transaction`.**
   - `payments.charge` is an irreversible network call, and it runs before `markPaid`. If `markPaid` or the commit fails, the DB rolls back but the customer has already been charged, and the invoice stays `open`.
   - `runBus.emit('invoice.paid')` at line 37 fires before the commit. A rollback leaves subscribers holding an event for a payment that never persisted (the skill's "events emitted before the write commits can outlive a rollback").
   - The transaction also stays open for the whole Stripe round trip.
   - Fix:
     - Read and validate the invoice first. Call `charge` outside any transaction, with an idempotency key such as the invoice id.
     - Then open a short transaction that only does `markPaid` (plus any other DB writes).
     - Emit `invoice.paid` after the commit returns.
     - If the charge must be reconciled, mark the invoice `charging` first, or use an outbox.
   - Related gap: `pay` never checks `invoice.status === 'paid'` (line 26). A double POST or a retry charges the customer twice. Add the guard as a domain invariant, and pass an idempotency key into `PaymentGateway.charge` / `StripeGateway` (`adapters/payments/stripe.ts:12`).

2. **`modules/billing/service.ts:11-17` (HIGH): the job handler holds business logic, and it is not retry-safe.**
   - The `jobs.register` callback loops over rows, builds the email text, sends the mail and marks the receipt as sent. A handler is a driving adapter and should only adapt the payload and call a service method.
   - If `mailer.send` succeeds and `markReceiptSent` (line 15) fails or the process dies, the retry sends a duplicate email, because the row is still `receiptSent=false`. Send and mark are not atomic, and a single failure aborts the rest of the loop.
   - Fix: register `() => this.sendPendingReceipts()` and move the loop into that service method. Make each row idempotent: claim the row first (`receiptStatus: 'sending'`, conditional update), send with a stable idempotency key such as the invoice id, then mark it sent. Handle failures per row.
   - Also, `receiptSent` and `receiptStatus` (`db/schema.ts:17-18`) are two columns for one fact, and `markReceiptSent` (`billing/repository.ts:26`) has to keep them in sync. Collapse them into one.

3. **`modules/billing/service.ts:43` and `modules/billing/repository.ts:8-10,13-15` (HIGH): tenancy is dropped for invoices.**
   - `get(workspaceId, invoiceId)` ignores `workspaceId`. `getById(id)` and `markPaid(id, ...)` filter on `id` only.
   - Any workspace can read and pay another workspace's invoice. `pay` scopes the customer lookup but not the invoice lookup (line 25).
   - Fix: make `workspaceId` a repository argument (`getById(workspaceId, id, tx?)`, `markPaid(workspaceId, id, ...)`) and filter on `and(eq(invoices.workspaceId, ws), eq(invoices.id, id))`, the way `CustomerRepository.get` already does.

4. **`modules/billing/service.ts:2,22,24` and `modules/customers/repository.ts:2` (MEDIUM): global `db` and a cross-module import bypass the container.**
   - The service imports the `db` singleton directly and calls `db.transaction`. It also does `import ... from '../customers/repository.js'` and `new CustomerRepository()` per call. The skill says cross-module access goes through the container (`container.customersRepo`), and a repository used by a second module should be constructed in the container.
   - `CustomerRepository` and `BillingRepository` both import the global `db`, so tests cannot inject a DB or handle.
   - Fix:
     - Add `customersRepo` to `platform/container.ts` and `ContainerOverrides`, and use `this.container.customersRepo`.
     - Expose the transaction through the container (for example `container.db` or a `withTransaction` helper) instead of importing `db` in the service.
     - Have the repositories take the handle as a constructor argument.

5. **`modules/billing/service.ts:42-46` with `modules/billing/routes.ts:12` (MEDIUM): a Drizzle row is returned straight over the wire, and there is no response schema.**
   - `get` returns the raw `invoices` row (`paymentRef`, `receiptStatus`, `receiptSent`, `workspaceId`, and so on). The wire contract mirrors the physical schema, so a column rename becomes an API break.
   - Neither route declares `schema.response`, so there is no output allowlist.
   - Fix: add `toInvoiceDto` in `billing/helpers.ts` and map at the edge. Add shared Zod contracts and `schema.response` on both routes.

6. **`modules/billing/routes.ts:9,11,15,17` (LOW): casting instead of typed params.**
   - `req.params as z.infer<typeof Params>` bypasses the type provider. The raw `{ params: Params }` schema only works if `fastify-type-provider-zod` and its compilers are set up, and the cast hides whether they are.
   - Fix: use `app.withTypeProvider<ZodTypeProvider>()` so `req.params` is typed and the cast goes away.

7. **`modules/billing/service.ts:9-10` (LOW): the service takes the whole `Container`.**
   - It uses only `jobs`, `billingRepo`, `mailer`, `payments` and `runBus`. This is accepted for existing services, but a new service should take the capabilities it uses so its dependencies are visible in its signature.
   - Registering the job inside the constructor also means constructing the service has a side effect. Move registration into the composition root or an explicit `init`, so tests that construct the service do not register jobs.
