import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import type { Container } from '../../platform/container.js';
import { NotificationsService } from './service.js';

const Params = z.object({ reviewId: z.string().uuid() });

export function registerNotificationRoutes(app: FastifyInstance, container: Container) {
  const service = new NotificationsService(container);

  app.post('/reviews/:reviewId/notify', { schema: { params: Params } }, async (req, reply) => {
    const ctx = getContext(container, req);
    const { reviewId } = req.params as z.infer<typeof Params>;
    await service.notifyReviewDone(ctx.workspaceId, reviewId);
    return reply.code(202).send({ queued: true });
  });
}
