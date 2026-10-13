import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CiExportInput } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { CiService } from './service.js';

/**
 * CI module (SPEC-05 Export to CI) — Export Wizard generation/install, the
 * agent CI tab, the global CI Runs page, and the manual Refresh-ingestion
 * pull. Routes stay thin: parse → `getContext` → delegate to `CiService` →
 * map. No `drizzle-orm` import here (onion-architecture, matches
 * `agents/routes.ts`'s shape).
 *
 *   POST /agents/:id/export-ci    → generate + install (AC-1..AC-8, AC-20, AC-21)
 *   GET  /agents/:id/ci           → the agent's CI tab (AC-18)
 *   POST /agents/:id/ci/refresh   → pull-ingest this agent's installed repos (AC-15/16)
 *   GET  /ci-runs                 → the global CI Runs page (AC-17)
 *   POST /ci-runs/refresh         → pull-ingest every installed repo in the workspace
 */

const CiRunsQuery = z.object({
  agent_id: z.string().uuid().optional(),
  repo: z.string().optional(),
  status: z.string().optional(),
});

export default async function ciRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new CiService(app.container);

  app.post(
    '/agents/:id/export-ci',
    { schema: { params: IdParams, body: CiExportInput } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const result = await service.exportCi(workspaceId, req.params.id, req.body);
      if (!result) throw new NotFoundError('Agent not found');
      reply.status(201);
      return result;
    },
  );

  app.get('/agents/:id/ci', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const installations = await service.listInstallationsForAgent(workspaceId, req.params.id);
    if (!installations) throw new NotFoundError('Agent not found');
    const runs = await service.listRunsForAgent(workspaceId, req.params.id);
    return { installations, runs: runs ?? [] };
  });

  app.post('/agents/:id/ci/refresh', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const result = await service.refreshRuns(workspaceId, req.params.id);
    for (const r of result.rejections) {
      req.log.warn({ repo: r.repo, runId: r.runId, reason: r.reason }, 'ci refresh: rejected artifact');
    }
    return { ingested: result.ingested, rejected: result.rejections.length };
  });

  app.get('/ci-runs', { schema: { querystring: CiRunsQuery } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.listRunsForWorkspace(workspaceId, {
      agentId: req.query.agent_id,
      repo: req.query.repo,
      status: req.query.status,
    });
  });

  app.post('/ci-runs/refresh', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const result = await service.refreshRuns(workspaceId);
    for (const r of result.rejections) {
      req.log.warn({ repo: r.repo, runId: r.runId, reason: r.reason }, 'ci refresh: rejected artifact');
    }
    return { ingested: result.ingested, rejected: result.rejections.length };
  });
}
