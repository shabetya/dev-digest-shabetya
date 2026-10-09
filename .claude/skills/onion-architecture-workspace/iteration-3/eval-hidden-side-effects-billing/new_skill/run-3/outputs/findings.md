# Architecture review: billing module (src/ paths relative to fixtures/billing)

1. **src/modules/billing/service.ts:24-39 (CRITICAL) - Stripe charge inside `db.transaction()`, and not retry/double-charge safe.**
   `payments.charge` (line 30) is a network call made while the transaction holds a pooled connection. If `markPaid` or the commit fails, the rollback cannot undo the charge, so the customer is charged but the invoice stays `open`. A retry then charges again. There is also no idempotency key and no claim step, so two concurrent `POST /pay` calls both charge.
   Fix: claim first with a conditional update (`open -> paying`, returning the row; only the winner continues). Call the gateway outside any transaction, passing an idempotency key (the invoice id) through the `PaymentGateway.charge` port to Stripe. Then persist the result in a short transaction (`markPaid`). Alternatively, persist a `pending` intent in the transaction and charge after commit.

2. **src/modules/billing/service.ts:37 (HIGH) - `runBus.emit('invoice.paid')` inside the transaction.**
   A rollback at line 35 or at commit does not retract the event, so subscribers see a paid invoice that does not exist.
   Fix: return the data from the unit of work and emit after `db.transaction()` resolves.

3. **src/modules/billing/service.ts:11-17 (HIGH) - Receipt job handler is not safe to run twice.**
   The handler sends mail (line 14) and only then marks the row sent (line 15). A crash between the two, or a job retry, re-sends the receipt. The loop is also not concurrency-safe: two runs both read the same pending rows. The `receiptStatus` column (default `pending`) exists but is never used for a claim.
   Fix: in the repository, add `claimReceipt(id)`: `UPDATE ... SET receipt_status='sending' WHERE id=$1 AND receipt_status='pending' RETURNING ...`. Send only if a row is returned. Mark it `sent` afterwards, or pass an idempotency key to the mailer. Also move the loop body into a named service method (`sendPendingReceipts()`) so the registered callback only adapts and delegates.

4. **src/modules/billing/repository.ts:8-10, 13-14 (and callers service.ts:25, 43) (HIGH) - Reads and writes by id without the tenant (cross-tenant leak).**
   `getById(id)` and `markPaid(id, ...)` have no `workspaceId` predicate. `BillingService.get(workspaceId, invoiceId)` (line 42) ignores `workspaceId` entirely, so `GET /invoices/:id` returns any tenant's invoice. In `pay`, line 25 fetches the invoice with no tenant check, and the customer lookup at line 27 is the only scoping, which is one forgotten line from disappearing.
   Fix: change the signatures to `getById(workspaceId, id, tx?)` and `markPaid(workspaceId, id, ...)`, with `eq(invoices.workspaceId, workspaceId)` in the query. Pass `workspaceId` from the service.

5. **src/modules/billing/service.ts:45 + routes.ts:12 (MEDIUM) - Drizzle row returned straight to the wire.**
   `get` returns the raw `invoices` row. This exposes `paymentRef`, `receiptStatus`, `receiptSent` and `workspaceId`, and ties the API contract to the physical schema. The route declares no `schema.response`, so nothing strips fields.
   Fix: add a `toInvoiceDto` in `helpers.ts` (or a shared contract type) and declare `schema.response` on both routes.

6. **src/modules/billing/service.ts:4,22 (MEDIUM) - Cross-module import and per-call instantiation of `CustomerRepository`.**
   `billing` reaches into `../customers/repository.js` and does `new CustomerRepository()` on every `pay`. That couples the modules at source level and bypasses the container.
   Fix: construct the repository once in `platform/container.ts` (`container.customersRepo`, with an override slot) and use it from the service.

7. **src/modules/billing/service.ts:2,24 + both repository.ts files (MEDIUM) - Service and repositories use the global `db` singleton.**
   The service imports `db` from `db/client.js` to open the transaction, and the repositories import the same singleton as their default handle. Wiring bypasses the composition root, so tests cannot override the DB through `ContainerOverrides`.
   Fix: expose the db handle (or a `withTransaction` helper) on the container. Keep the "caller owns the transaction, repository receives `tx`" shape. Note that `CustomerRepository.get` (line 27) is not passed `tx`, so it reads outside the unit of work. Give it the optional `tx` parameter too.

8. **src/modules/billing/routes.ts:11,17 (LOW) - `req.params as z.infer<...>` casts.**
   The cast suggests the zod type provider is not driving the handler types. Use `fastify-type-provider-zod` (`app.withTypeProvider<ZodTypeProvider>()`) so `req.params` is typed from the schema without a cast.

Checked and not flagged: `adapters/payments/amount.ts` (pure functions filed under `adapters/` are core logic by behavior), `db/seed.ts` (boundary script, may use the clock and `console`), `adapters/payments/stripe.ts` (an adapter, so it may use `Date` and the SDK), and `modules/health/routes.ts` (routes-only module with no DB access).
