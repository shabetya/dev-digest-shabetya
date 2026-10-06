import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { NotFoundError } from '../../platform/errors.js';
import type { Container } from '../../platform/container.js';

const CreateBody = z.object({ userId: z.string().uuid(), text: z.string().min(1), dueAt: z.coerce.date() });
const DispatchParams = z.object({ workspaceId: z.string().uuid() });

export function registerReminderRoutes(app: FastifyInstance, container: Container) {
  app.get('/reminders', async (req) => {
    const ctx = getContext(container, req);
    return container.remindersService.list(ctx.workspaceId);
  });

  app.post('/reminders', { schema: { body: CreateBody } }, async (req, reply) => {
    const ctx = getContext(container, req);
    const body = req.body as z.infer<typeof CreateBody>;
    const created = await container.remindersService.create(ctx.workspaceId, body.userId, body.text, body.dueAt);
    return reply.code(201).send(created);
  });

  app.post('/reminders/dispatch', { schema: { params: DispatchParams } }, async (req) => {
    const ctx = getContext(container, req);
    const sent = await container.remindersService.dispatchDue(ctx.workspaceId);
    if (sent === 0) throw new NotFoundError('due reminders');
    return { sent };
  });
}
