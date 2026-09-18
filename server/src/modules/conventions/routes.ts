import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ConventionsService } from './service.js';

/**
 * Conventions module (Skills Lab → Conventions).
 *   POST /repos/:id/conventions/extract → sample + LLM-propose + verify +
 *                                          persist candidates for this repo
 *   GET  /repos/:id/conventions         → list persisted candidates
 *   POST /conventions/:id/accept        → accept one candidate
 *   POST /conventions/:id/reject        → reject one candidate
 *
 * Merging accepted candidates into a Skill is NOT a route here — the client
 * builds the skill body and calls the existing `POST /skills`; linking that
 * skill to an agent is the existing `POST /agents/:id/skills`.
 */
export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.post(
    '/repos/:id/conventions/extract',
    { schema: { params: IdParams } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const candidates = await service.extract(workspaceId, req.params.id);
      reply.status(201);
      return candidates;
    },
  );

  app.post('/conventions/:id/accept', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.setStatus(workspaceId, req.params.id, 'accepted');
  });

  app.post('/conventions/:id/reject', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.setStatus(workspaceId, req.params.id, 'rejected');
  });
}
