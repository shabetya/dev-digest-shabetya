import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import type { Container } from '../../platform/container.js';
import { InvoicesService } from './service.js';

const IssueBody = z.object({
  customerId: z.string().uuid(),
  dueAt: z.coerce.date(),
  lines: z.array(z.object({ description: z.string(), amountCents: z.number().int().positive() })).min(1),
});

export function registerInvoiceRoutes(app: FastifyInstance, container: Container) {
  const service = new InvoicesService(container);

  app.post('/invoices', { schema: { body: IssueBody } }, async (req, reply) => {
    const ctx = getContext(container, req);
    const body = req.body as z.infer<typeof IssueBody>;
    const id = await service.issue(ctx.workspaceId, body.customerId, body.dueAt, body.lines);
    return reply.code(201).send({ id });
  });
}
