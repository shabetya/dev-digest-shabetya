import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import type { Container } from '../../platform/container.js';

const Params = z.object({ id: z.string().uuid() });

export function registerBillingRoutes(app: FastifyInstance, container: Container) {
  app.get('/invoices/:id', { schema: { params: Params } }, async (req) => {
    const ctx = getContext(container, req);
    const { id } = req.params as z.infer<typeof Params>;
    return container.billingService.get(ctx.workspaceId, id);
  });

  app.post('/invoices/:id/pay', { schema: { params: Params } }, async (req, reply) => {
    const ctx = getContext(container, req);
    const { id } = req.params as z.infer<typeof Params>;
    const result = await container.billingService.pay(ctx.workspaceId, id);
    return reply.code(201).send(result);
  });
}
