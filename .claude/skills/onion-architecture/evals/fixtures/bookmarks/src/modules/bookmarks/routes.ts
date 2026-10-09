import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { bookmarks } from '../../db/schema.js';
import { getContext } from '../_shared/context.js';
import type { Container } from '../../platform/container.js';

const Params = z.object({ id: z.string().uuid() });
const CreateBody = z.object({ url: z.string().url(), title: z.string().min(1) });

export function registerBookmarkRoutes(app: FastifyInstance, container: Container) {
  app.get('/bookmarks', async (req) => {
    const ctx = getContext(container, req);
    return db.select().from(bookmarks).where(eq(bookmarks.workspaceId, ctx.workspaceId));
  });

  app.get('/bookmarks/:id', { schema: { params: Params } }, async (req, reply) => {
    const ctx = getContext(container, req);
    const { id } = req.params as z.infer<typeof Params>;
    const [row] = await db
      .select()
      .from(bookmarks)
      .where(and(eq(bookmarks.id, id), eq(bookmarks.workspaceId, ctx.workspaceId)));
    if (!row) {
      return reply.code(404).send({ ok: false, message: 'bookmark missing' });
    }
    return row;
  });

  app.post('/bookmarks', { schema: { body: CreateBody } }, async (req, reply) => {
    const ctx = getContext(container, req);
    const body = req.body as z.infer<typeof CreateBody>;
    const [row] = await db
      .insert(bookmarks)
      .values({ workspaceId: ctx.workspaceId, url: body.url, title: body.title })
      .returning();
    return reply.code(201).send(row);
  });
}
