import { eq } from 'drizzle-orm';
import { PrBrief } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { BriefLogger } from './types.js';

/**
 * PR-brief data-access. Owns `pr_brief`: one row per PR (`pr_id` is the PK),
 * `json` holds the whole `PrBrief`. The table has no `workspace_id`, so callers
 * MUST resolve the PR through its workspace first (`reviewRepo.getPull`).
 */

export class BriefRepository {
  constructor(
    private db: Db,
    private log?: BriefLogger,
  ) {}

  /** AC-2: a row that fails `PrBrief.safeParse` (corrupt / pre-SPEC-03 shape) is "no brief". */
  async getByPrId(prId: string): Promise<PrBrief | null> {
    const [row] = await this.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));
    if (!row) return null;
    const parsed = PrBrief.safeParse(row.json);
    if (!parsed.success) {
      this.log?.warn(
        { prId, issues: parsed.error.issues.slice(0, 5).map((i) => i.path.join('.')) },
        'stored PR brief failed validation; treating as no brief',
      );
      return null;
    }
    return parsed.data;
  }

  /** Single current brief per PR: insert or replace. */
  async upsert(prId: string, brief: PrBrief): Promise<void> {
    await this.db
      .insert(t.prBrief)
      .values({ prId, json: brief })
      .onConflictDoUpdate({ target: t.prBrief.prId, set: { json: brief } });
  }
}
