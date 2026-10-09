import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { invoices, customers } from '../../db/schema.js';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class BillingRepository {
  async getById(id: string, tx: Tx | typeof db = db) {
    const [row] = await tx.select().from(invoices).where(eq(invoices.id, id));
    return row;
  }

  async markPaid(id: string, paymentRef: string, paidAt: Date, tx: Tx | typeof db = db) {
    await tx.update(invoices).set({ status: 'paid', paymentRef, paidAt }).where(eq(invoices.id, id));
  }

  async listPendingReceipts() {
    return db
      .select({ id: invoices.id, email: customers.email, amountCents: invoices.amountCents })
      .from(invoices)
      .innerJoin(customers, eq(customers.id, invoices.customerId))
      .where(and(eq(invoices.status, 'paid'), eq(invoices.receiptSent, false)));
  }

  async markReceiptSent(id: string) {
    await db.update(invoices).set({ receiptSent: true, receiptStatus: 'sent' }).where(eq(invoices.id, id));
  }
}
