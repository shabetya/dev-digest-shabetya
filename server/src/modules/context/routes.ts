import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SpecFileList, SpecPreview } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ContextService } from './service.js';

/**
 * Project context (SPEC-01).
 *   GET /repos/:id/context          → { files, truncated, reason? }
 *   GET /repos/:id/context/preview  → { path, content }  (?path=<repo-relative .md>)
 * Read-only: no endpoint writes doc content.
 */
const PreviewQuery = z.object({ path: z.string().min(1) });

export default async function contextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ContextService(app.container, app.container.contextRepo);

  app.get(
    '/repos/:id/context',
    { schema: { params: IdParams, response: { 200: SpecFileList } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.list(workspaceId, req.params.id);
    },
  );

  app.get(
    '/repos/:id/context/preview',
    { schema: { params: IdParams, querystring: PreviewQuery, response: { 200: SpecPreview } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.preview(workspaceId, req.params.id, req.query.path);
    },
  );
}
