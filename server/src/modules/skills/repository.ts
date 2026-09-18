import { and, desc, eq } from 'drizzle-orm';
import type { Db, Tx } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillSource, SkillType } from '@devdigest/shared';
import { INITIAL_SKILL_VERSION } from './constants.js';

/**
 * Skills data-access. Owns `skills` and `skill_versions`. Mirrors
 * AgentsRepository's shape: every write that changes content snapshots a
 * version row as part of the same unit of work (own transaction unless the
 * caller passes `tx`). Workspace-scoped throughout.
 */

import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
export type { SkillRow, SkillVersionRow };

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  source?: SkillSource;
  body: string;
  enabled?: boolean;
  evidenceFiles?: string[] | null;
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
  evidenceFiles?: string[] | null;
}

/** Fields whose change bumps the skill's version (anything but `enabled`). */
function isContentChange(existing: SkillRow, patch: UpdateSkill): boolean {
  return (
    (patch.name !== undefined && patch.name !== existing.name) ||
    (patch.description !== undefined && patch.description !== existing.description) ||
    (patch.type !== undefined && patch.type !== existing.type) ||
    (patch.body !== undefined && patch.body !== existing.body) ||
    (patch.evidenceFiles !== undefined &&
      JSON.stringify(patch.evidenceFiles) !== JSON.stringify(existing.evidenceFiles))
  );
}

export class SkillsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<SkillRow[]> {
    return this.db.select().from(t.skills).where(eq(t.skills.workspaceId, workspaceId));
  }

  async getById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  /** Delete a skill (scoped to workspace). agent_skills/skill_versions cascade.
   *  Returns false if no such skill existed in the workspace. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  /**
   * Insert a skill AND record version 1 in skill_versions as a single unit of
   * work. Own transaction unless the caller passes `tx`.
   */
  async insert(values: InsertSkill, tx?: Tx): Promise<SkillRow> {
    const run = async (conn: Db | Tx): Promise<SkillRow> => {
      const [row] = await conn
        .insert(t.skills)
        .values({
          workspaceId: values.workspaceId,
          name: values.name,
          description: values.description,
          type: values.type,
          source: values.source ?? 'manual',
          body: values.body,
          enabled: values.enabled ?? true,
          version: INITIAL_SKILL_VERSION,
          evidenceFiles: values.evidenceFiles ?? null,
        })
        .returning();
      await this.snapshotVersion(row!, INITIAL_SKILL_VERSION, conn);
      return row!;
    };
    return tx ? run(tx) : this.db.transaction((trx) => run(trx));
  }

  /**
   * Update a skill. Any content change (name/description/type/body/
   * evidenceFiles — anything but `enabled`) bumps the version and snapshots the
   * new body into skill_versions, mirroring the agent config-versioning
   * invariant. The write + snapshot pair runs atomically.
   */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkill,
    tx?: Tx,
  ): Promise<SkillRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;

    const contentChanged = isContentChange(existing, patch);
    const nextVersion = contentChanged ? existing.version + 1 : existing.version;

    const run = async (conn: Db | Tx): Promise<SkillRow | undefined> => {
      const [row] = await conn
        .update(t.skills)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.type !== undefined ? { type: patch.type } : {}),
          ...(patch.body !== undefined ? { body: patch.body } : {}),
          ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
          ...(patch.evidenceFiles !== undefined ? { evidenceFiles: patch.evidenceFiles } : {}),
          ...(contentChanged ? { version: nextVersion } : {}),
        })
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .returning();

      if (contentChanged && row) await this.snapshotVersion(row, nextVersion, conn);
      return row;
    };
    return tx ? run(tx) : this.db.transaction((trx) => run(trx));
  }

  private async snapshotVersion(
    row: SkillRow,
    version: number,
    conn: Db | Tx = this.db,
  ): Promise<void> {
    await conn
      .insert(t.skillVersions)
      .values({ skillId: row.id, version, body: row.body })
      .onConflictDoNothing();
  }

  /** All body snapshots for a skill, newest version first. */
  async listVersions(skillId: string): Promise<SkillVersionRow[]> {
    return this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }

  /**
   * Raw data for the Stats tab: which agents currently link this skill, and
   * one flat, fanned-out row per (run × finding) — or one row per run with
   * null finding fields when that run had none — for every run where this
   * skill was active (`run_skills`), scoped to the workspace. No aggregation
   * here; `computeSkillStats` (helpers.ts) reduces these into `SkillStats`.
   * Returns undefined if the skill isn't in this workspace (route → 404).
   */
  async getStats(workspaceId: string, skillId: string): Promise<SkillStatsRaw | undefined> {
    const skill = await this.getById(workspaceId, skillId);
    if (!skill) return undefined;

    const usedByAgents = await this.db
      .select({ id: t.agents.id, name: t.agents.name, enabled: t.agents.enabled })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agents.id, t.agentSkills.agentId))
      .where(and(eq(t.agentSkills.skillId, skillId), eq(t.agents.workspaceId, workspaceId)));

    const rows = await this.db
      .select({
        runId: t.agentRuns.id,
        status: t.agentRuns.status,
        ranAt: t.agentRuns.ranAt,
        costUsd: t.agentRuns.costUsd,
        reviewId: t.reviews.id,
        verdict: t.reviews.verdict,
        findingCategory: t.findings.category,
        acceptedAt: t.findings.acceptedAt,
        dismissedAt: t.findings.dismissedAt,
      })
      .from(t.runSkills)
      .innerJoin(t.agentRuns, eq(t.agentRuns.id, t.runSkills.runId))
      .leftJoin(t.reviews, eq(t.reviews.runId, t.agentRuns.id))
      .leftJoin(t.findings, eq(t.findings.reviewId, t.reviews.id))
      .where(and(eq(t.runSkills.skillId, skillId), eq(t.agentRuns.workspaceId, workspaceId)));

    return { usedByAgents, rows };
  }
}

export interface SkillStatsUsingAgentRow {
  id: string;
  name: string;
  enabled: boolean;
}

export interface SkillStatsRow {
  runId: string;
  status: string | null;
  ranAt: Date;
  costUsd: number | null;
  reviewId: string | null;
  verdict: string | null;
  findingCategory: string | null;
  acceptedAt: Date | null;
  dismissedAt: Date | null;
}

export interface SkillStatsRaw {
  usedByAgents: SkillStatsUsingAgentRow[];
  rows: SkillStatsRow[];
}
