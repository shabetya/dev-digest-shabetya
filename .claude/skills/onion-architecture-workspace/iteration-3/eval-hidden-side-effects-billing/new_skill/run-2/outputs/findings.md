# Architecture review: billing fixture (paths under src/)

1. **modules/billing/service.ts:24-35 (CRITICAL) - Stripe charge runs inside `db.transaction()`, and `pay` is not safe to repeat.**
   `payments.charge` is a network call made while the transaction holds a pooled connection and the invoice row. If `markPaid` or the commit fails, the customer is charged but the invoice stays `open`, and the charge cannot be rolled back. There is also no status guard, so a client retry of `POST /invoices/:id/pay` charges again. `StripeGateway.charge` (adapters/payments/stripe.ts:11-18) takes no idempotency key.
   Fix:
   - Claim the invoice first with a conditional update (`open -> paying`, returning the row). Only the winner proceeds.
   - Call the gateway outside any transaction, passing an idempotency key (the invoice id) as a new `PaymentGateway.charge` parameter, and implement it in `StripeGateway`.
   - Persist the result in a short transaction (`markPaid`). Reject or return the existing result if the invoice is already paid.

2. **modules/billing/service.ts:37 (HIGH) - `runBus.emit('invoice.paid')` fires inside the transaction.**
   A rollback does not retract the event, so subscribers see a payment that never committed.
   Fix: return or collect the event from the unit of work and emit it after the transaction resolves.

3. **modules/billing/service.ts:11-17 and modules/billing/repository.ts:17-27 (HIGH) - the receipt job sends the email first and marks it sent afterwards.**
   A crash or retry between `mailer.send` (line 14) and `markReceiptSent` (line 15) re-sends the receipt on the next run. Two overlapping runs also both read the same pending rows, so they double-send.
   Fix:
   - Add a `claimReceipt(id)` repository method that does a conditional `UPDATE ... SET receipt_status='sending' WHERE id=? AND receipt_status='pending' RETURNING ...`. Only the claim winner sends, then sets `sent`. Alternatively, pass an idempotency key to the mailer.
   - `receiptStatus` and `receiptSent` (db/schema.ts:17-18) hold the same state twice. Drop `receiptSent` and use the status column.
   - Move the loop body into a service method (e.g. `sendPendingReceipts()`). The `jobs.register` callback should only adapt the payload and call that method, since a job handler is a driving adapter and must not hold rules.

4. **modules/billing/repository.ts:8-10, service.ts:25 and 43 (HIGH) - reads by id are not tenant-scoped, and `get` leaks across tenants.**
   `getById(id)` has no `workspaceId` predicate. `BillingService.get(workspaceId, invoiceId)` accepts `workspaceId` and never uses it (line 43), so `GET /invoices/:id` returns any tenant's invoice. In `pay`, the tenant is only checked indirectly, through the customer lookup at line 27.
   Fix: change the signature to `getById(workspaceId, id, tx?)` and put `and(eq(invoices.workspaceId, workspaceId), eq(invoices.id, id))` in the query. Likewise scope `markPaid` and `markReceiptSent` by workspace, or by an id that was already resolved with its tenant.

5. **modules/billing/service.ts:4, 22, 27 (HIGH) - cross-module import, a repository built in the service, and a read outside the transaction.**
   - The service imports `../customers/repository.js` and does `new CustomerRepository()` on each `pay` call. Cross-module access should go through the container.
   - `CustomerRepository.get` (customers/repository.ts:6-12) has no `tx` parameter and uses the global `db`. The customer read at line 27 therefore runs on a different connection from the invoice read in the same "transaction".
   Fix: construct `CustomerRepository` in `platform/container.ts` (e.g. `container.customersRepo`) and use that. Give `get` an optional trailing `tx` parameter. If this call ends up outside the transaction after fix 1, the `tx` parameter is only needed for any remaining in-transaction read.

6. **modules/billing/service.ts:2, 24 (MEDIUM) - the service imports the global `db` singleton.**
   Transaction ownership in the service is correct. Reaching for `../../db/client.js` directly means tests cannot swap the database through `ContainerOverrides`.
   Fix: expose the handle (or a `withTransaction` helper) from the container and use it, so the service has no db import.

7. **modules/billing/service.ts:42-46, routes.ts:9-13 (MEDIUM) - `get` returns the raw Drizzle row to the client, and routes declare no `schema.response`.**
   The wire contract mirrors the physical table. It exposes `paymentRef`, `receiptSent`, `receiptStatus` and `workspaceId`, and a column rename becomes an API break. Neither route (lines 9 and 15) declares `schema.response`, so there is no output allowlist.
   Fix: map to a contract DTO in `modules/billing/helpers.ts` (`toInvoiceDto`) and declare `schema.response` with a zod schema on both routes.

8. **modules/billing/routes.ts:11, 17 (LOW) - params are cast, not parsed through the type provider.**
   `req.params as z.infer<typeof Params>` bypasses type inference. The schema does validate at runtime, but the cast is hand-maintained.
   Fix: use `app.withTypeProvider<ZodTypeProvider>()` so `req.params` is typed from the schema with no cast.

## Checked and not reported
- `adapters/payments/amount.ts` is pure functions filed under `adapters/`. It is core logic by behavior, so importing it from the service is not a layering violation. Its `toMinorUnits` has a no-op factor, a correctness oddity rather than a layering problem.
- `db/seed.ts` uses `Date.now`, `new Date` and `console.log`. Boundary scripts are exempt.
- `adapters/payments/stripe.ts` reading `new Date(...)` from Stripe's response is legitimate adapter behavior.
- `health/routes.ts` is a routes-only module with no DB access, which is fine.
- The service taking the whole `Container` is the accepted existing convention.
