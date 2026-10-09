# Billing module: architecture review

Paths are relative to `.../evals/fixtures/billing/`.

1. **`src/modules/billing/service.ts:24-39` (CRITICAL): Stripe charge inside `db.transaction()`.**
   `payments.charge` (line 30) is a network call. It holds a pooled connection and row locks for the whole round trip. If the commit fails after Stripe succeeds, the customer is charged but the invoice stays unpaid, and the charge cannot be rolled back.
   Fix: do not call the gateway inside the transaction.
   - Claim the invoice first with a conditional update, `UPDATE invoices SET status='paying' WHERE id=? AND workspace_id=? AND status='open' RETURNING *`. Only the winner proceeds.
   - Call `charge` outside any transaction, passing an idempotency key such as the invoice id. This needs a new parameter on the `PaymentGateway` port and in `StripeGateway`.
   - Then persist the result with `markPaid` in a short transaction.

2. **`src/modules/billing/service.ts:25-35` (CRITICAL): `pay` is not safe to repeat.**
   Nothing checks `invoice.status`. A retry, a double click or a concurrent request charges the customer again, and there is no lock or claim to stop it.
   Fix: use the claim from finding 1, and throw `ValidationError` or a conflict error when the invoice is already `paid` or `paying`.

3. **`src/modules/billing/service.ts:37` (HIGH): bus event emitted inside the transaction.**
   `runBus.emit('invoice.paid')` fires before the commit. If the transaction rolls back, subscribers have already acted on a payment that never existed.
   Fix: return the result from the transaction (or from the short persist step) and emit after it resolves.

4. **`src/modules/billing/service.ts:11-17` (CRITICAL): receipt job handler sends first and marks after, so it is not retry-safe.**
   `mailer.send` runs on line 14 and `markReceiptSent` on line 15. A crash between them, or a retry from `platform/jobs.ts`, re-sends the email. The handler also loops over every pending row with no claim, so two overlapping runs send duplicates.
   Fix: claim each row before sending.
   - Run `UPDATE ... SET receipt_status='sending' WHERE receipt_status='pending' AND status='paid' RETURNING ...`.
   - Send with an idempotency key.
   - Then mark the row `sent`, and revert it to `pending` on failure.
   This also removes the duplicated state in `src/db/schema.ts:17-18`. `receiptStatus` and `receiptSent` encode the same thing, so keep one.

5. **`src/modules/billing/service.ts:11-17` and `src/modules/billing/repository.ts:17-26` (MEDIUM): job handler holds business logic, and the receipt queries are not tenant-scoped.**
   The handler is a driving adapter, but here it holds the loop, the message composition and the mark-sent rule.
   Fix: move the body into `BillingService.sendPendingReceipts()` and have the registered callback call it.
   `listPendingReceipts` and `markReceiptSent` take no `workspaceId`. If receipts are processed per tenant they need it. If the job is intentionally global, document that.

6. **`src/modules/billing/service.ts:43` and `src/modules/billing/repository.ts:8-10` (CRITICAL): cross-tenant read on `GET /invoices/:id`.**
   `get(workspaceId, invoiceId)` ignores `workspaceId` and calls `getById(invoiceId)`. Any tenant can read any invoice by id. `pay` has the same flaw at line 25, so one tenant can charge another tenant's invoice, because the tenant check only happens on the customer lookup (line 27).
   Fix: change the repository signature to `getById(workspaceId, id, tx?)` and put `eq(invoices.workspaceId, workspaceId)` in the query predicate. Update every caller. Also scope `markPaid` and `markReceiptSent` by workspace.

7. **`src/modules/billing/service.ts:2,24` (MEDIUM): service imports the `db` singleton directly.**
   The service reaches into the persistence layer to start the transaction, which couples it to infrastructure and bypasses the container.
   Fix: expose a unit-of-work or `transaction(fn)` on the repository or container, wired in `platform/container.ts`. Overrides then work in tests. The service should still own the transaction boundary, but without importing `db`.

8. **`src/modules/billing/service.ts:4,22` (MEDIUM): cross-module import and per-call instantiation.**
   `billing` imports `../customers/repository.js` and does `new CustomerRepository()` on every `pay` call. This couples two modules at source level and bypasses the container.
   Fix: construct `customerRepo` in `platform/container.ts` (with an overrides slot) and use `this.container.customerRepo`.

9. **`src/modules/billing/service.ts:45`, `src/modules/billing/routes.ts:9-13` (MEDIUM): raw Drizzle row returned over the wire, and no response schema.**
   `get` returns the `invoices` row, which includes internal fields (`paymentRef`, `receiptStatus`, `receiptSent`, `workspaceId`). This makes the API contract a mirror of the physical schema. Neither route declares `schema.response`, so nothing strips extra fields.
   Fix: add `toInvoiceDto` in a billing `helpers.ts`, return the DTO from the service, and declare `schema.response` with a zod allowlist on both routes.

10. **`src/modules/billing/routes.ts:11,17` (LOW): `req.params as z.infer<...>` casts.**
    The routes bypass the zod type provider by casting. Register `fastify-type-provider-zod` (`app.withTypeProvider<ZodTypeProvider>()`) so `req.params` is typed from the schema without a cast.

Checked and not flagged:
- `src/adapters/payments/amount.ts` is pure code filed under `adapters/`, so it counts as core logic and the service may import it.
- `Date`, `console` and `Date.now` in `src/db/seed.ts`, and `new Date` in `StripeGateway`, are exempt (boundary script and adapter).
