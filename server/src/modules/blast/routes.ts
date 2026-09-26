/**
 * blast module.
 *   GET /pulls/:id/blast → BlastRadiusResponse (read-only, pre-calculated
 *                          impact map; never runs fresh analysis or an LLM
 *                          call — see `getBlast`/`mapBlastResult`).
 */
import { BlastRadiusResponse } from '@devdigest/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { getBlast } from './service.js';

export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get(
    '/pulls/:id/blast',
    { schema: { params: IdParams, response: { 200: BlastRadiusResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return getBlast(container, workspaceId, req.params.id);
    },
  );
}
