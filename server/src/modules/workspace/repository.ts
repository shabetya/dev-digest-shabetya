import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * F1 — workspace data-access layer. The ONLY place this module touches
 * `repos`.
 */

export type RepoRow = typeof t.repos.$inferSelect;

export class WorkspaceRepository {
  constructor(private db: Db) {}

  async listRepos(workspaceId: string): Promise<RepoRow[]> {
    return this.db.select().from(t.repos).where(eq(t.repos.workspaceId, workspaceId));
  }
}
