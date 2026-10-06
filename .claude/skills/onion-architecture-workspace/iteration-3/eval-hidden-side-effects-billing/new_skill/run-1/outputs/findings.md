# Architecture review: billing fixture (paths under `src/`)

1. **`modules/billing/service.ts:24-39` (Stripe charge inside `db.transaction`).**
   `payments.charge(...)` at line 30 is a network call made while the transaction holds a pooled connection and row locks. It also cannot be rolled back. If `markPaid` fails or the commit fails, the customer has been charged and the DB says the invoice is open.
   Fix: split it into three steps. (a) Read and validate in a short transaction, or flip `status` to a `pending` intent with a conditional update. (b) Call `payments.charge` outside any transaction, ideally with an idempotency key derived from the invoice id so a retry cannot double-charge. (c) Persist the result in a second short transaction (`markPaid`).

2. **`modules/billing/service.ts:37` (`runBus.emit('invoice.paid')` inside the transaction).**
   A rollback after line 37 does not retract the event, so subscribers see a payment that never committed.
   Fix: collect the event during the unit of work and emit it after `db.transaction` resolves.

3. **`modules/billing/service.ts:11-17` + `modules/billing/repository.ts:17-27` (receipt job is not retry-safe and holds logic).**
   - The handler sends the mail (line 14) and only then calls `markReceiptSent` (line 15). A crash or retry in between sends the receipt again. It also loops over a list read up front, so two concurrent runs both send every receipt.
   - The handler body is orchestration, not adapt-and-call. The loop, message formatting and state flips belong in a named service method, with the callback only calling it.
   - `receiptStatus` and `receiptSent` (`db/schema.ts:17-18`) are two flags for the same fact. Only `receiptSent` is used in the query.
   Fix: claim before acting. Add `claimReceipt(id)` doing `UPDATE ... SET receipt_status='sending' WHERE id=$1 AND receipt_status='pending' RETURNING ...`, and send only if a row is returned. Then mark `sent`, or revert to `pending` on failure. Pass an idempotency key to the mailer where it supports one. Drop the redundant boolean. Move the loop into `BillingService.sendPendingReceipts()` and have the job callback call it.

4. **`modules/billing/repository.ts:8-10` (`getById(id)` has no tenant), used at `service.ts:25` and `service.ts:43`.**
   - `get` (line 43) accepts `workspaceId` and ignores it. `GET /invoices/:id` returns any tenant's invoice by uuid, which is a cross-tenant leak.
   - `pay` (line 25) loads the invoice with no workspace check, so it can charge another tenant's invoice. The customer lookup at line 27 is scoped, but the invoice itself is not.
   Fix: change the signature to `getById(workspaceId, id, tx?)` with `and(eq(invoices.workspaceId, workspaceId), eq(invoices.id, id))` in the query. Update both call sites. Also scope `markPaid` by workspace.

5. **`modules/billing/service.ts:4,22` (cross-module reach into `customers/repository`, instantiated per call).**
   `new CustomerRepository()` inside `pay()` couples billing to the customers folder at source level. It also builds a repository outside the composition root, so it cannot be overridden in tests.
   Fix: construct `CustomerRepository` once in `platform/container.ts` (lazy getter plus a `ContainerOverrides` slot). Use `this.container.customersRepo` here and remove the import.

6. **`modules/billing/service.ts:42-46` + `routes.ts:12,18-19` (Drizzle row returned to the wire).**
   `get` returns the raw `invoices` row, including `paymentRef`, `receiptStatus`, `receiptSent` and `workspaceId`. The API contract is now a mirror of the physical schema. No `schema.response` is declared, so nothing strips extra fields.
   Fix: add `toInvoiceDto` in `modules/billing/helpers.ts` and return the DTO type from `@devdigest/shared`. Declare `schema.response` on both routes (including the 201 for `pay`). Replace the `req.params as ...` casts with the zod type provider's inferred types.

7. **`modules/billing/service.ts:2,24` and `modules/billing/repository.ts:2` (global `db` import used directly).**
   The service and repository import the `db` singleton instead of receiving it. This ties both to a concrete connection and makes it hard to inject a test database.
   Fix: take the DB handle from the container (the service starts the transaction from `container.db`, the repository is constructed with it). Keep the `tx` parameter as the explicit propagation mechanism.

Not reported (checked, no violation): `adapters/payments/amount.ts` is pure code filed under `adapters/`, so a service importing it is fine. `db/seed.ts` is a boundary script and may use `Date.now`, `new Date()` and `console.log`. `StripeGateway` correctly keeps the SDK inside the adapter. `routes.ts` does not query the DB directly. `modules/health/routes.ts` is a legitimate routes-only module.
