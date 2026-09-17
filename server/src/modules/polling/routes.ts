import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { PollingService } from './service.js';

/**
 * F1 — polling module. Transport layer only: parses requests and delegates to
 * PollingService.
 *   POST /repos/:id/poll  → sync PR list from GitHub, bump last_polled_at
 */
export default async function pollingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new PollingService(app.container);

  app.post('/repos/:id/poll', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.pollRepo(workspaceId, req.params.id);
  });
}
