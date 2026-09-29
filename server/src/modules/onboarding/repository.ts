import { eq, sql } from 'drizzle-orm';
import { Onboarding } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Onboarding data-access. Owns the `onboarding` table: one row per repo
 * (`repo_id` is the PK), `json` holds everything except `generated_at`, which
 * is the row column (set by the DB clock on upsert). The table has no
 * `workspace_id`, so callers MUST resolve the repo through its workspace first.
 */

export type OnboardingBody = Omit<Onboarding, 'generated_at'>;

export interface OnboardingLogger {
  warn(obj: object, msg: string): void;
  info(obj: object, msg: string): void;
}

export class OnboardingRepository {
  constructor(
    private db: Db,
    private log?: OnboardingLogger,
  ) {}

  /** AC-17: a row that fails `Onboarding.safeParse` (corrupt / unknown version) is "no tour". */
  async getByRepoId(repoId: string): Promise<Onboarding | null> {
    const [row] = await this.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId));
    if (!row) return null;
    const json = typeof row.json === 'object' && row.json !== null ? row.json : {};
    const parsed = Onboarding.safeParse({ ...json, generated_at: row.generatedAt.toISOString() });
    if (!parsed.success) {
      this.log?.warn(
        { repoId, issues: parsed.error.issues.slice(0, 5).map((i) => i.path.join('.')) },
        'stored onboarding tour failed validation; treating as no tour',
      );
      return null;
    }
    return parsed.data;
  }

  /** Single current tour per repo: insert or replace; `generated_at` = now(). */
  async upsert(repoId: string, body: OnboardingBody): Promise<void> {
    await this.db
      .insert(t.onboarding)
      .values({ repoId, json: body })
      .onConflictDoUpdate({
        target: t.onboarding.repoId,
        set: { json: body, generatedAt: sql`now()` },
      });
  }
}
