import type { Container } from '../../platform/container.js';
import type { NewLine } from './repository.js';

const LATE_FEE_JOB = 'invoices.apply-late-fees';

export class InvoicesService {
  constructor(private container: Container) {
    this.container.jobs.register(LATE_FEE_JOB, async () => {
      const now = new Date();
      const overdue = await this.container.invoiceRepo.listOverdue(now);
      for (const inv of overdue) {
        const lines = await this.container.invoiceRepo.linesFor(inv.id);
        const subtotal = lines.reduce((sum, l) => sum + l.amountCents, 0);
        const daysLate = Math.floor((now.getTime() - inv.dueAt.getTime()) / 86_400_000);
        const months = Math.max(1, Math.ceil(daysLate / 30));
        const fee = Math.min(subtotal * 0.015 * months, subtotal * 0.2);
        await this.container.invoiceRepo.setLateFee(inv.id, (fee / 100).toFixed(2));
      }
    });
  }

  async issue(workspaceId: string, customerId: string, dueAt: Date, lines: NewLine[]) {
    const repo = this.container.invoiceRepo;
    const invoice = await repo.insertInvoice(workspaceId, customerId, dueAt);
    await repo.insertLines(invoice.id, lines);
    await repo.markIssued(invoice.id, new Date());
    return invoice.id;
  }

  scheduleLateFees() {
    return this.container.jobs.enqueue(LATE_FEE_JOB, {});
  }
}
