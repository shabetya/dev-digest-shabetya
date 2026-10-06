import { and, eq, lt } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { invoices, invoiceLines } from '../../db/schema.js';

export interface NewLine {
  description: string;
  amountCents: number;
}

export class InvoiceRepository {
  async insertInvoice(workspaceId: string, customerId: string, dueAt: Date) {
    const [row] = await db.insert(invoices).values({ workspaceId, customerId, dueAt }).returning();
    return row!;
  }

  async insertLines(invoiceId: string, lines: NewLine[]) {
    if (lines.length === 0) return;
    await db.insert(invoiceLines).values(lines.map((l) => ({ ...l, invoiceId })));
  }

  async markIssued(invoiceId: string, at: Date) {
    await db.update(invoices).set({ status: 'issued', issuedAt: at }).where(eq(invoices.id, invoiceId));
  }

  async listOverdue(now: Date) {
    return db
      .select()
      .from(invoices)
      .where(and(eq(invoices.status, 'issued'), lt(invoices.dueAt, now)));
  }

  async linesFor(invoiceId: string) {
    return db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId));
  }

  async setLateFee(invoiceId: string, fee: string) {
    await db.update(invoices).set({ lateFee: fee }).where(eq(invoices.id, invoiceId));
  }
}
