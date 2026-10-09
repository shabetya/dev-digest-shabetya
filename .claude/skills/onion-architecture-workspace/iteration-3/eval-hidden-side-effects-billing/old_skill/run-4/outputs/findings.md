# Billing module: architecture review

Paths are relative to `fixtures/billing/`.

1. **`src/modules/billing/service.ts:24-39`: Stripe charge and event emit inside the DB transaction.**
   - `payments.charge(...)` (line 30) is a network call made inside `db.transaction`. If `markPaid` (line 35) or the commit fails, the customer has been charged but the DB rolls back to "open". A retry then charges again, because no idempotency key is passed.
   - `runBus.emit('invoice.paid')` (line 37) fires before the commit, so it can outlive a rollback.
   - Fix:
     - Keep the transaction short. Read and validate first, then call the gateway outside any tx, passing an idempotency key such as the invoice id.
     - Open the tx only for `markPaid`.
     - Emit the event after the tx resolves.
     - If delivery must be guaranteed, write an outbox row in the same tx instead.

2. **`src/modules/billing/service.ts:2,22,24`, `service.ts:4`: service reaches around the container.**
   - It imports the `db` singleton directly and starts the transaction on it.
   - It imports a sibling module's file (`../customers/repository.js`) and does `new CustomerRepository()` per call.
   - Fix:
     - Construct `customersRepo` in `platform/container.ts` and use `this.container.customersRepo`.
     - Get the tx runner from the container or the repository (e.g. a `withTransaction` helper) instead of importing `db`.
   - This keeps cross-module access a wiring decision and makes the service testable via `ContainerOverrides`.

3. **`src/modules/billing/service.ts:42-46`, `repository.ts:8-11`, `service.ts:25`: invoice reads are not workspace-scoped (tenant leak).**
   - `get(workspaceId, invoiceId)` ignores `workspaceId`.
   - `getById` filters only on `invoices.id`, so any workspace can read or pay another workspace's invoice by UUID.
   - `pay` has the same hole at line 25. Only the customer lookup is scoped, and the invoice's own `customerId` is trusted.
   - Fix: change to `getById(workspaceId, id, tx?)` with `and(eq(invoices.workspaceId, workspaceId), eq(invoices.id, id))`, and pass `workspaceId` from both service methods.

4. **`src/modules/billing/service.ts:45`, `routes.ts:9-13`: raw Drizzle row returned to the wire, with no response schema.**
   - `get` returns the `invoices` row, which exposes `paymentRef`, `receiptStatus`, `receiptSent` and `workspaceId`. The wire contract mirrors the physical schema.
   - No route declares `schema.response`, so nothing strips fields.
   - Fix:
     - Map to a contract DTO (e.g. `toInvoiceDto` in `helpers.ts`) at the edge.
     - Declare `schema.response` on both routes.

5. **`src/modules/billing/service.ts:11-17`: business logic inside the job handler, registered in the constructor.**
   - The loop (list pending, send mail, mark sent) is the work itself, not an adapter calling a service.
   - Registering in the constructor makes construction a side effect.
   - Fix: move the body into a method such as `sendPendingReceipts()`. The `jobs.register` callback should only call it. Do the registration from the composition root or an explicit `init`.

6. **`src/modules/billing/service.ts:14-15`, `repository.ts:17-27`: receipt job is not retry-safe.**
   - Mail is sent (line 14) before `markReceiptSent` (line 15). A crash or failure between them re-sends the receipt on the next run.
   - A failure on one row aborts the rest of the batch.
   - Two overlapping runs can both read the same pending rows and double-send.
   - Fix:
     - Claim the row first with an atomic `UPDATE ... SET receipt_status='sending' WHERE receipt_sent=false AND receipt_status='pending' RETURNING`.
     - Send with a per-invoice idempotency key.
     - Mark `sent` or `failed` per row, with try/catch so one failure does not stop the batch.

7. **`src/modules/billing/routes.ts:11,17`: `req.params as z.infer<...>` bypasses the validation seam.**
   - The zod schema is passed to Fastify with no zod type provider, so the cast is the only typing.
   - Fix: register `fastify-type-provider-zod` and use `app.withTypeProvider<ZodTypeProvider>()`. Then `req.params` is typed from `schema.params` and the cast goes away.

8. **`src/adapters/payments/stripe.ts:15` vs `src/modules/billing/service.ts:32`, `amount.ts:1-4`: currency is hard-coded and the port has no currency.**
   - The service computes `toMinorUnits(..., 'usd')`, but `StripeGateway.charge` takes no currency and hard-codes `'usd'`. A `'eur'` invoice would be charged in USD.
   - `toMinorUnits` is a no-op: the factor is always 1 on the only reachable branch. It also takes cents and returns "minor units", which are the same thing.
   - Fix:
     - Add `currency` to the `PaymentGateway.charge` signature in `vendor/shared/adapters.ts` and pass it through.
     - Store currency on the invoice.
     - Delete `toMinorUnits`.
   - Vendor-mirror reminder: `vendor/shared` is hand-copied to the client, so port the delta there too.

Not flagged, since they are not violations under the skill:
- `amount.ts` is a pure file under `adapters/`. Classify it by behaviour, so it is core logic and the service may import it.
- `seed.ts` is a script.
- `health/routes.ts` is a legitimate routes-only module.
- `_shared/context.ts` is the sanctioned Fastify-adaptation point.
