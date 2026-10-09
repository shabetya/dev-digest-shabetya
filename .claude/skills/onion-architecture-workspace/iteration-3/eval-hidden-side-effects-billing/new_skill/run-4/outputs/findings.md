# Architecture review: billing fixture

Paths are relative to `src/`.

1. **`modules/billing/service.ts:30-34` (inside the transaction opened at :24): the Stripe charge runs inside `db.transaction()`.**
   - The connection and row locks are held for the whole network call. If the commit fails after the charge succeeds, the customer is charged and the invoice stays `open`. A retry then double-charges.
   - Fix: persist intent first. In a short transaction, claim the invoice with a conditional update `open -> paying` that returns the row. Commit, then call `payments.charge(...)` and pass the invoice id as an idempotency key. Finish in a second short transaction that runs `markPaid`.

2. **`modules/billing/service.ts:37`: `runBus.emit('invoice.paid')` is called inside the transaction.**
   - A rollback after the emit leaves subscribers acting on a payment that never got recorded.
   - Fix: collect the event while the unit of work runs and emit it after `db.transaction()` returns.

3. **`modules/billing/service.ts:11-17`: the receipt job is not safe to run twice.**
   - `mailer.send` (:14) runs before `markReceiptSent` (:15). A crash between them, or a `platform/jobs.ts` retry, sends the receipt again.
   - There is also no claim step, so two concurrent runs both read the same `listPendingReceipts()` rows and both send.
   - Fix: claim each row before acting, with `UPDATE ... SET receipt_status='sending' WHERE id=? AND receipt_status='pending' RETURNING ...`. Only the winner sends, then marks `sent`. Alternatively pass an idempotency key (the invoice id) to the mailer. Reset the status, or add a `failed` state, if the send throws.
   - `repository.ts:17-23` filters on `receiptSent`, not `receiptStatus`. The `receiptStatus` column is written but never read as a claim, so the state machine is half-built.

4. **`modules/billing/repository.ts:8-10`, `service.ts:25` and `service.ts:43`: `getById(id)` has no tenant predicate.**
   - `pay()` loads any workspace's invoice by id. It only checks the workspace indirectly, on the customer lookup at :27, and that lookup uses `invoice.customerId` rather than anything the caller proved.
   - `get()` (:42-46) accepts `workspaceId` but never uses it, so `GET /invoices/:id` is a cross-tenant read.
   - Fix: make the signature `getById(workspaceId, id, tx?)` and put `eq(invoices.workspaceId, workspaceId)` in the query.

5. **`modules/billing/repository.ts:13-15` and `:25-27`: `markPaid` and `markReceiptSent` update by `id` only.**
   - They carry no workspace predicate, so they can write across tenants.
   - Fix: add `workspaceId` to `markPaid`. `markReceiptSent` and `listPendingReceipts` are system-wide job paths, so either make the scope explicit or carry the workspace on the row being processed.

6. **`modules/billing/service.ts:4` and `:22`: cross-module import, and the repository is built per call.**
   - `BillingService` imports `../customers/repository.js` and does `new CustomerRepository()` on every `pay()`.
   - Fix: construct `CustomerRepository` once in `platform/container.ts` (`container.customersRepo`, with an override slot) and read it from there. Alternatively, add a billing-owned lookup.

7. **`modules/billing/service.ts:2` and `:24`: the service imports the global `db` singleton.**
   - Transaction ownership in the service is correct, but the singleton is imported directly rather than reached through the container.
   - Overriding the DB then means mocking modules instead of passing `ContainerOverrides`, which is the seam the architecture provides.
   - Fix: expose `container.db` (or a `container.tx(fn)` unit-of-work helper) and use it here.

8. **`modules/billing/service.ts:11-17`: the job handler holds business logic.**
   - It loops, composes the receipt text and sequences send-then-mark. A job handler should adapt the payload and call a service method, as a route handler does.
   - Fix: move the body into `BillingService.sendPendingReceipts()` and have the registered callback only call it. Also consider registering the job from the container or an init step instead of as a constructor side effect (:10-18), so constructing the service has no effect on `jobs`.

9. **`modules/billing/service.ts:42-46`: `get()` returns the Drizzle row, and the route returns it directly (`routes.ts:12`).**
   - The physical schema becomes the wire contract. That exposes `stripeCustomerId`-adjacent state and `paymentRef`, `receiptSent` and `receiptStatus`. No `schema.response` allowlist strips them.
   - Fix: map to a DTO in `helpers.ts` (`toInvoiceDto`) and declare `schema.response` on both routes. `routes.ts:19` returns a `{ id, paymentRef }` result that also has no response schema.

10. **`modules/billing/routes.ts:11` and `:17`: params are cast with `req.params as z.infer<typeof Params>`.**
    - The zod schema in `schema.params` is declared, but the handler re-asserts the type by hand. This suggests `fastify-type-provider-zod` is not typing the route.
    - Fix: register the type provider (`app.withTypeProvider<ZodTypeProvider>()`) so `req.params` is inferred and the cast goes away.

11. **`modules/billing/service.ts:30`: external side effects take no idempotency key.**
    - `StripeGateway.charge` (`adapters/payments/stripe.ts:11-18`) takes no idempotency key. The port is therefore unsafe to retry.
    - Fix: add `idempotencyKey` to `PaymentGateway.charge`, pass `{ idempotencyKey }` as Stripe request options, and call it with the invoice id.

## Checked and not flagged

- `adapters/payments/amount.ts` is pure, with no I/O. Under the "classify by behavior" rule it is core logic that happens to sit in `adapters/`, so the service importing it is fine. It would live more naturally in `modules/billing/helpers.ts`, but that is optional. Separately, `toMinorUnits` multiplies by 1 in both branches, which looks like a logic bug, but it is not a layering problem.
- `db/seed.ts` uses `Date.now()`, `new Date()` and `console.log`. Boundary scripts are exempt.
- `modules/customers/repository.ts` correctly takes `workspaceId` and scopes the query.
- `modules/health/routes.ts` is a stage-1 routes-only module with no DB access, which is acceptable.
- `modules/_shared/context.ts` is the sanctioned place where Fastify types touch the context.
- `platform/errors.ts` is fine. The error-handler mapping is outside this fixture.
