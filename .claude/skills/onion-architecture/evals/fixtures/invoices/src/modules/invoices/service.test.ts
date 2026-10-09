import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./repository.js', () => {
  const insertInvoice = vi.fn(async () => ({ id: 'inv-1' }));
  const insertLines = vi.fn(async () => undefined);
  const markIssued = vi.fn(async () => undefined);
  return {
    InvoiceRepository: vi.fn(() => ({ insertInvoice, insertLines, markIssued })),
    __mocks: { insertInvoice, insertLines, markIssued },
  };
});

import { InvoicesService } from './service.js';
import { InvoiceRepository } from './repository.js';

describe('InvoicesService.issue', () => {
  let service: InvoicesService;

  beforeEach(() => {
    const container = {
      invoiceRepo: new InvoiceRepository(),
      jobs: { register: vi.fn(), enqueue: vi.fn() },
    } as never;
    service = new InvoicesService(container);
  });

  it('returns the new invoice id', async () => {
    const id = await service.issue('ws', 'cust', new Date(), [{ description: 'Setup', amountCents: 1000 }]);
    expect(id).toBe('inv-1');
  });
});
