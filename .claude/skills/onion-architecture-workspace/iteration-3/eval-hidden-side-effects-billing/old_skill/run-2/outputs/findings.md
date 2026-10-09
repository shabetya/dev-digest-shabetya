# Architecture review: billing fixture

Paths are relative to `fixtures/billing/`.

1. **`src/modules/billing/service.ts:24-39`: the external Stripe charge runs inside `db.transaction`.**
   - `payments.charge(...)` at line 30 is a network call to a third party. It holds a DB connection and locks open for its whole duration.
   - A rollback cannot undo the charge. If `markPaid` (line 35) or the commit fails, the customer has been charged and the invoice is still `open`.
   - Fix: split the work into phases.
     - Read and validate in a short transaction or none.
     - Call `charge` outside any transaction, passing an idempotency key derived from the invoice id.
     - Open a short transaction only for `markPaid`.
     - If reliable recovery is needed, persist a `charging` state first and reconcile on failure.

2. **`src/modules/billing/service.ts:37`: `runBus.emit('invoice.paid')` fires inside the transaction, before the commit.**
   - If the commit fails or rolls back, subscribers have already seen "paid" for an invoice that is not paid.
   - Fix: emit after `db.transaction(...)` resolves. For delivery that must not be lost, use a transactional outbox.

3. **`src/modules/billing/service.ts:20-40`: no domain invariant guards `pay`, so it can charge twice.**
   - It never checks `invoice.status`. Calling the endpoint twice, or retrying after a timeout, charges the customer again.
   - Fix: throw a domain error if the invoice is already `paid`, and use an idempotency key (see 1). A conditional update (`... where status = 'open'` returning the row count) also makes `markPaid` race-safe.

4. **`src/modules/billing/service.ts:43` and `repository.ts:9`: invoice reads are not workspace-scoped, which is a tenancy hole.**
   - `get()` receives `workspaceId` and ignores it. `pay()` calls `repo.getById(invoiceId, tx)` without it.
   - Any workspace can read or pay another workspace's invoice by guessing the id. Only the customer lookup is scoped, and it is scoped by the invoice's own `customerId`.
   - Fix: change to `getById(workspaceId, id, tx?)` and filter on `invoices.workspaceId`. This matches `CustomerRepository.get`.

5. **`src/modules/billing/service.ts:2,24`: the service imports the global `db` singleton to open the transaction.**
   - This bypasses the container. A test cannot swap the DB through `ContainerOverrides`.
   - Fix: expose the transaction runner through the container, for example `container.db.transaction` or a `UnitOfWork`. Keep "caller owns the transaction, repository receives the `tx`", but inject the handle source.

6. **`src/modules/billing/service.ts:4,22`: cross-module import, and the repository is instantiated per call.**
   - `new CustomerRepository()` reaches into `../customers/` from inside `billing`, and does so on every `pay`. This couples the two modules at source level.
   - Fix: construct `customerRepo` once in `platform/container.ts` and use `this.container.customerRepo`.

7. **`src/modules/billing/service.ts:11-17`: the job handler contains the business logic.**
   - The `jobs.register` callback loops over pending invoices, builds the email text, sends mail and marks receipts. A handler is a driving adapter. It should adapt the payload and call a service method.
   - It is also not retry-safe. `mailer.send` (line 14) happens before `markReceiptSent` (line 15). A crash or retry between the two sends a duplicate receipt, and one failing row aborts the rest of the batch.
   - Fix:
     - Move the body into `sendPendingReceipts()` and keep the handler as `() => this.sendPendingReceipts()`.
     - Claim each row before sending, for example flip `receiptStatus` to `sending` atomically.
     - Isolate failures per row so one bad email does not stop the others.

8. **`src/modules/billing/service.ts:42-46` with `routes.ts:9-13,18-19`: the API returns a raw Drizzle row, and no route declares `schema.response`.**
   - `GET /invoices/:id` returns the whole `invoices` row. That includes `workspaceId`, `paymentRef`, `receiptSent` and `receiptStatus`, so the wire contract mirrors the physical schema.
   - Fix: map to a contract type in `billing/helpers.ts` (a `toInvoiceDto`) and declare a zod `schema.response` on both routes as an output allowlist. Return the DTO from the service or route, not the row.

## Checked and not flagged
- `adapters/payments/amount.ts` is pure, so it counts as core logic wherever it is filed. Importing it from the service is fine.
- `StripeGateway`, `getContext`, `errors.ts` and `health/routes.ts` are correctly placed.
- `db/seed.ts` uses `Date.now()`, `new Date()` and `console.log`, which is acceptable in a script.
