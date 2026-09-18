import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionRow } from '../../db/rows.js';
export type { ConventionRow };

/**
 * Conventions data-access. Owns the `conventions` table — one row per
 * candidate, workspace + repo scoped. No versioning (unlike skills): a
 * candidate is either pending, accepted, or rejected; the "merge accepted
 * into a Skill" step lives in the client + the existing skills module.
 */

export interface InsertConvention {
  workspaceId: string;
  repoId: string;
  category: string;
  rule: string;
  evidencePath: string;
  evidenceLineStart: number;
  evidenceLineEnd: number;
  evidenceSnippet?: string | null;
  confidence?: number | null;
}

export class ConventionsRepository {
  constructor(private db: Db) {}

  /**
   * Newest first, `id` as a stable tiebreaker: every candidate from one
   * `extract()` call shares the same `created_at` (one INSERT statement), so
   * `created_at` alone doesn't give a deterministic order across refetches.
   */
  async listByRepo(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(desc(t.conventions.createdAt), t.conventions.id);
  }

  async getById(workspaceId: string, id: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row;
  }

  async insertMany(rows: InsertConvention[]): Promise<ConventionRow[]> {
    if (rows.length === 0) return [];
    return this.db
      .insert(t.conventions)
      .values(
        rows.map((r) => ({
          workspaceId: r.workspaceId,
          repoId: r.repoId,
          category: r.category,
          rule: r.rule,
          evidencePath: r.evidencePath,
          evidenceLineStart: r.evidenceLineStart,
          evidenceLineEnd: r.evidenceLineEnd,
          evidenceSnippet: r.evidenceSnippet ?? null,
          confidence: r.confidence ?? null,
        })),
      )
      .returning();
  }

  async setStatus(
    workspaceId: string,
    id: string,
    status: 'accepted' | 'rejected',
  ): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({ status })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }
}
