# Architecture review: billing fixture (onion-architecture v1.0.0)

Paths relative to `.../fixtures/billing/`.

1. **`src/modules/billing/service.ts:24-39` (HIGH): Stripe charge and bus event inside the DB transaction.**
   `payments.charge()` (a network call that moves money) and `runBus.emit('invoice.paid')` both run inside `db.transaction`.
   - If `markPaid` or the commit fails, the customer is already charged and the DB rolls back. The invoice stays `open`, and a retry charges again.
   - The event is emitted before commit, so subscribers can see "paid" for an invoice that rolls back.
   - A long Stripe call also holds a DB connection and row locks.
   - Fix:
     - Load and validate the invoice and customer first.
     - Call `charge` outside any transaction, passing an idempotency key (the invoice id). Add that parameter to the `PaymentGateway` port in `vendor/shared/adapters.ts` and to `StripeGateway`.
     - Open a short `db.transaction` that only does `markPaid`.
     - Emit `invoice.paid` after the transaction resolves.
     - Optionally persist a `payment_pending` state first, or use an outbox, so a crash between charge and `markPaid` can be reconciled.

2. **`src/modules/billing/service.ts:42-46` and `src/modules/billing/repository.ts:8-10` (HIGH): tenancy not enforced on invoices.**
   - `get(workspaceId, invoiceId)` ignores `workspaceId`. `getById(id)` filters by id only, so any workspace can read any invoice (cross-tenant leak).
   - `pay()` (service.ts:25) has the same gap. The customer lookup is workspace-scoped, but the invoice lookup is not, so a workspace can pay another tenant's invoice.
   - Fix: change to `getById(workspaceId, id, tx?)` with `and(eq(invoices.workspaceId, workspaceId), eq(invoices.id, id))`. Pass `workspaceId` from both service methods.

3. **`src/modules/billing/service.ts:11-17` (HIGH): the job handler holds business logic and is not retry-safe; the constructor registers it as a side effect.**
   - The callback is a driving adapter and should only adapt the payload and call a service method. Here it loops, composes the receipt text and sequences send then mark.
   - `mailer.send` then `markReceiptSent` is not atomic. A crash or retry between them re-sends the receipt to the customer.
   - One failing send aborts the rest of the batch.
   - Registering the job inside the constructor means constructing the service has a hidden side effect.
   - Fix:
     - Move the body into a method such as `sendPendingReceipts()` and have the registered callback call only that.
     - Make it idempotent: claim each row before sending (for example `UPDATE ... SET receipt_status='sending' WHERE receipt_status='pending' RETURNING`), or pass a per-invoice idempotency key to the mailer, and handle failures per row.
     - Register the job from a container or startup hook rather than the constructor.

4. **`src/modules/billing/service.ts:4,22` (MEDIUM): cross-module source import and a per-call repository.**
   - The billing service imports `../customers/repository.js` and does `new CustomerRepository()` on every `pay()`.
   - Cross-module access should go through the container, and a repository used by another module should be built once there.
   - Fix: add `customerRepo` to `platform/container.ts` and `ContainerOverrides`, and use `this.container.customerRepo`. This also lets tests override it.

5. **`src/modules/billing/service.ts:2,24` and `src/modules/billing/repository.ts:2,8` (MEDIUM): ambient global `db` singleton.**
   - The service imports `db` directly to open the transaction, and the repository defaults to the global `db`.
   - The service cannot be exercised through `ContainerOverrides`, because the DB sits outside the container.
   - Starting the transaction in the service is correct. Obtain the handle from the container (for example `container.db` or a `container.tx(fn)` helper) instead of importing the module singleton.

6. **`src/modules/billing/service.ts:45` and `src/modules/billing/routes.ts:9-12,15-20` (MEDIUM): raw Drizzle row returned, with no response schema.**
   - `GET /invoices/:id` returns the `invoices` row as the wire contract. That exposes `paymentRef`, `receiptStatus` and `receiptSent`, and ties the API to the physical schema.
   - Fix:
     - Map to a DTO type from `@devdigest/shared` in `billing/helpers.ts` (for example `toInvoiceDto`), at the edge.
     - Declare `schema.response` on both routes so the output is an allowlist.

7. **`src/modules/billing/routes.ts:6-11` (LOW): the params schema is declared, but the handler re-casts `req.params` with `as z.infer<...>`.**
   - The cast suggests `fastify-type-provider-zod` is not set up (or not used on these routes), so the handler is not getting a typed, validated value.
   - Fix: register the zod type provider and drop the cast.

Reviewed and not flagged:
- `adapters/payments/amount.ts` is pure code filed under `adapters/`. A service importing it is fine under "classify by behavior".
- The `StripeGateway` shape, `health/routes.ts`, `_shared/context.ts` and `errors.ts` are fine.
- `db/seed.ts` is dev tooling.
