import type { Container } from '../../platform/container.js';
import { db } from '../../db/client.js';
import { NotFoundError } from '../../platform/errors.js';
import { CustomerRepository } from '../customers/repository.js';
import { describeCharge, toMinorUnits } from '../../adapters/payments/amount.js';

const RECEIPT_JOB = 'billing.send-receipts';

export class BillingService {
  constructor(private container: Container) {
    this.container.jobs.register(RECEIPT_JOB, async () => {
      const pending = await this.container.billingRepo.listPendingReceipts();
      for (const row of pending) {
        await this.container.mailer.send(row.email, `Receipt for ${describeCharge(row.id, row.amountCents)}`);
        await this.container.billingRepo.markReceiptSent(row.id);
      }
    });
  }

  async pay(workspaceId: string, invoiceId: string) {
    const repo = this.container.billingRepo;
    const customers = new CustomerRepository();

    return db.transaction(async (tx) => {
      const invoice = await repo.getById(invoiceId, tx);
      if (!invoice) throw new NotFoundError('invoice');
      const customer = await customers.get(workspaceId, invoice.customerId);
      if (!customer) throw new NotFoundError('customer');

      const charge = await this.container.payments.charge(
        customer.stripeCustomerId,
        toMinorUnits(invoice.amountCents, 'usd'),
        describeCharge(invoice.id, invoice.amountCents),
      );
      await repo.markPaid(invoice.id, charge.id, charge.chargedAt, tx);

      this.container.runBus.emit(workspaceId, { type: 'invoice.paid', invoiceId: invoice.id });
      return { id: invoice.id, paymentRef: charge.id };
    });
  }

  async get(workspaceId: string, invoiceId: string) {
    const invoice = await this.container.billingRepo.getById(invoiceId);
    if (!invoice) throw new NotFoundError('invoice');
    return invoice;
  }

  scheduleReceipts() {
    return this.container.jobs.enqueue(RECEIPT_JOB, {});
  }
}
