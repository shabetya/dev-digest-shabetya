import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SettingsRow } from './helpers.js';

/**
 * F1 — settings data-access layer. The ONLY place this module touches
 * `settings`.
 */

export class SettingsRepository {
  constructor(private db: Db) {}

  async listForWorkspace(workspaceId: string): Promise<SettingsRow[]> {
    return this.db.select().from(t.settings).where(eq(t.settings.workspaceId, workspaceId));
  }

  /** Upsert one key/value pref, scoped to workspace + user (unique target). */
  async upsert(workspaceId: string, userId: string, key: string, value: unknown): Promise<void> {
    await this.db
      .insert(t.settings)
      .values({ workspaceId, userId, key, value })
      .onConflictDoUpdate({
        target: [t.settings.workspaceId, t.settings.userId, t.settings.key],
        set: { value },
      });
  }
}
