import type { FastifyInstance } from 'fastify';
import { getContext } from '../_shared/context.js';
import { WorkspaceService } from './service.js';

/**
 * F1 — workspace module. Transport layer only: parses requests and delegates
 * to WorkspaceService.
 *   GET /workspace → workspace info + cloneDir + cloned repos summary
 */
export default async function workspaceRoutes(app: FastifyInstance) {
  const service = new WorkspaceService(app.container);

  app.get('/workspace', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.getSummary(workspaceId);
  });
}
