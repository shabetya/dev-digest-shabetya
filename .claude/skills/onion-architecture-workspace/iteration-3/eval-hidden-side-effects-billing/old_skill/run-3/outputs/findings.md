# Architecture review: billing fixture (onion-architecture v1.0.0)

Paths are relative to `fixtures/billing/`.

1. **`src/modules/billing/service.ts:24-39`: external payment call inside the DB transaction.** `payments.charge()` (Stripe, network) runs inside `db.transaction`. If `markPaid` fails or the commit fails, the DB rolls back but the card has already been charged. The transaction also holds a connection open for the duration of a network call.
   Fix: split `pay` into three steps:
   - Tx 1: validate the invoice and mark it `payment_pending`.
   - Outside any tx: call `charge()` with an idempotency key derived from the invoice id.
   - Tx 2: `markPaid`.
   Add a reconcile path for a charge that succeeded when Tx 2 failed.

2. **`src/modules/billing/service.ts:37`: event emitted inside the transaction, before commit.** `runBus.emit('invoice.paid')` fires before the commit. If the commit fails, subscribers have already been told the invoice is paid.
   Fix: emit after `db.transaction(...)` resolves, using the value it returns.

3. **`src/modules/billing/service.ts:25-27` and `repository.ts:8-10`: tenancy is not enforced, and one read is outside the tx.**
   - `getById(id)` filters by invoice id only. `pay` and `get` (service.ts:43) accept `workspaceId` but never use it for the invoice, so any workspace can read or pay another workspace's invoice (IDOR). In `get`, `workspaceId` is an unused parameter.
   - `customers.get(...)` at line 27 is not passed `tx`, so it runs on a different connection from the rest of the unit of work.
   Fix:
   - Change `getById(workspaceId, id, tx?)` to filter `and(eq(invoices.workspaceId, ...), eq(invoices.id, ...))`.
   - Give `CustomerRepository.get` an optional `tx` parameter and pass it.
   - Scope `markPaid` and `markReceiptSent` by workspace as well.

4. **`src/modules/billing/service.ts:20-26`: missing domain invariant, so a double pay causes a double charge.** `pay` never checks `invoice.status`. A retried request or double click charges the customer again.
   Fix: throw a `ValidationError` or conflict error if the invoice is not `open`. Combine this with the idempotency key from finding 1.

5. **`src/modules/billing/service.ts:4,22`: cross-module import, and a repository built per call.** The service imports `../customers/repository.js` directly and runs `new CustomerRepository()` on every `pay`. This couples the modules at the source level and bypasses the composition root.
   Fix: construct `customersRepo` in `platform/container.ts` (with an override slot) and use `this.container.customersRepo`.

6. **`src/modules/billing/service.ts:2,24` and both repositories: the `db` singleton is imported straight into the service and repositories.** The service reaches around the container, so tests cannot inject a DB handle through `ContainerOverrides`. The repositories hard-wire the same import.
   Fix: take the db (or a `withTransaction` helper) from the container. Keep `tx` as an optional last parameter on repositories.

7. **`src/modules/billing/service.ts:11-17`: job handler holds business logic and is not retry-safe.**
   - The loop of list, send mail, mark sent lives inside the `jobs.register` callback, in the constructor. A handler should adapt the payload and call a service method.
   - Side effect in the constructor: every instantiation of the service registers a job.
   - Send-then-mark is not atomic. A crash or a `markReceiptSent` failure after `send` means the retry sends a duplicate receipt.
   - One failing mail aborts the whole batch.
   Fix:
   - Move the body to `BillingService.sendPendingReceipts()` and keep the callback as `() => this.sendPendingReceipts()`.
   - Register jobs from the composition root rather than the constructor.
   - Claim each row before sending (`pending` to `sending`, atomically) and pass an idempotency key to the mailer.
   - Catch per row, so one failure does not abort the batch.

8. **`src/db/schema.ts:17-18`: redundant, divergent state.** `receiptStatus` ('pending') and `receiptSent` (boolean) encode the same fact. The repository writes both in `markReceiptSent`, but `listPendingReceipts` filters only on `receiptSent`. They can drift apart, and the status column cannot express the `sending` state that finding 7 needs.
   Fix: keep one column (`receiptStatus`: pending / sending / sent / failed) and drop the boolean.

9. **`src/modules/billing/service.ts:42-46` and `routes.ts:12`: the Drizzle row leaks to the wire.** `get` returns the `invoices` row as-is, including `paymentRef` and `workspaceId`, and the route sends it unchanged. No `schema.response` is declared, so nothing filters the output.
   Fix: map to a DTO in `helpers.ts` (`toInvoiceDto`) and declare `schema.response` on both routes.

10. **`src/modules/billing/routes.ts:9-11,15-17`: validation is only half-wired.** `schema.params` is declared, but the handler re-casts with `req.params as z.infer<...>`. That suggests the zod type provider is not in use, so the type is asserted rather than inferred.
    Fix: use `fastify-type-provider-zod` (`app.withTypeProvider<ZodTypeProvider>()`) so `req.params` is typed from the schema with no cast.

11. **`src/adapters/payments/stripe.ts:15` and `amount.ts:1-4`: currency handling is split across the port and the adapter.**
    - The service computes `toMinorUnits(invoice.amountCents, 'usd')` with a hard-coded currency.
    - The adapter independently hard-codes `currency: 'usd'`.
    - `toMinorUnits` multiplies by 1 in every case. The branch `? 1 : 100` is dead code and the function is misleading.
    - The invoice has no currency column.
    Fix: add `currency` to the invoice, add it to the `PaymentGateway.charge` signature, and drop `toMinorUnits` or give it a real conversion.
    Note: `amount.ts` is pure, so living under `adapters/` is not itself a violation. Classify it by behavior.

12. **`src/modules/billing/service.ts:10` (low): the new service takes the whole `Container`.** It touches `jobs`, `billingRepo`, `mailer`, `payments` and `runBus`. A new service should take only those capabilities, so its dependencies are visible in its signature.
    Fix: use a narrow constructor, for example `{ billingRepo, customersRepo, payments, mailer, runBus, jobs, tx }`.

Checked and fine:
- `health/routes.ts` is a routes-only module with no logic.
- `_shared/context.ts` is the sanctioned place where Fastify is adapted.
- `stripe.ts` keeps the SDK types inside the adapter and implements a port.
- `db/seed.ts` is a script outside the layering.
