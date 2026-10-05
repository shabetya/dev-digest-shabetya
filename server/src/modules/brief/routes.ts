import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrBrief } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BriefService } from './service.js';

/**
 * PR Why + Risk brief (SPEC-03).
 *   GET  /pulls/:id/brief           → stored brief, or `null` (200) when none
 *   POST /pulls/:id/brief/generate  → synchronous generate + persist (201);
 *                                     409 while one is in flight
 * Failures carry `error.details.reason` (llm_unavailable | no_files |
 * generation_failed | generation_in_progress).
 */
export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new BriefService(app.container, app.log);

  app.get(
    '/pulls/:id/brief',
    { schema: { params: IdParams, response: { 200: PrBrief.nullable() } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.get(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/brief/generate',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: { params: IdParams, response: { 201: PrBrief } },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const brief = await service.generate(workspaceId, req.params.id);
      reply.status(201);
      return brief;
    },
  );
}
