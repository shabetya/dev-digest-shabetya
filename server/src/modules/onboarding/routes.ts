import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { Onboarding } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { OnboardingService } from './service.js';

/**
 * Onboarding tour (SPEC-02).
 *   GET  /repos/:id/onboarding           → current tour, or `null` (200) when none
 *   POST /repos/:id/onboarding/generate  → synchronous generate + persist (201);
 *                                          409 while one is in flight
 * Failures carry `error.details.reason` (no_clone | index_unavailable |
 * llm_unavailable | generation_in_progress).
 */
export default async function onboardingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new OnboardingService(app.container, app.log);

  app.get(
    '/repos/:id/onboarding',
    { schema: { params: IdParams, response: { 200: Onboarding.nullable() } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.get(workspaceId, req.params.id);
    },
  );

  app.post(
    '/repos/:id/onboarding/generate',
    { schema: { params: IdParams, response: { 201: Onboarding } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const tour = await service.generate(workspaceId, req.params.id);
      reply.status(201);
      return tour;
    },
  );
}
