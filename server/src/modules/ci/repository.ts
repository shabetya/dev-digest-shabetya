import { and, desc, eq, isNull, or } from 'drizzle-orm';
import type { Db, Tx } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { CiTarget } from '@devdigest/shared';

/**
 * CI module data-access — owns `ci_installations` and `ci_runs`. Neither
 * table carries `workspace_id` (see SPEC-05/PLAN-05's "Missing elements"),
 * so every READ scopes through `agents` by joining on it — never a bare
 * `getById(id)` (onion-architecture: "every read by id carries the tenant").
 * WRITE methods take an already-workspace-validated `agentId` — same
 * convention `agents/repository.ts`'s `contextRepo`/`setSkills` calls use
 * (the service resolves + checks ownership once, via `getContext` +
 * `agentsRepo.getById(workspaceId, agentId)`, before calling in here).
 */

import type { CiInstallationRow, CiRunRow } from '../../db/rows.js';
export type { CiInstallationRow, CiRunRow };

export interface UpsertRunFromArtifact {
  ciInstallationId: string | null;
  prNumber: number | null;
  ranAt: Date;
  status: string;
  findingsCount: number;
  costUsd: number | null;
  githubUrl: string | null;
  source: string;
  commitSha: string;
  githubRunId: string;
  /** AC-17: from `CiResultArtifact.duration_ms` — null when the artifact didn't carry one. */
  durationMs: number | null;
}

export interface CiRunFilters {
  agentId?: string;
  repo?: string;
  status?: string;
  limit?: number;
}

export class CiRepository {
  constructor(private db: Db) {}

  /** One installation row per (agent, repo) — re-export upserts in place (AC-7 edge case). */
  async upsertInstallation(
    agentId: string,
    repo: string,
    targetType: CiTarget,
    tx?: Tx,
  ): Promise<CiInstallationRow> {
    const conn = tx ?? this.db;
    const [row] = await conn
      .insert(t.ciInstallations)
      .values({ agentId, repo, targetType })
      .onConflictDoUpdate({
        target: [t.ciInstallations.agentId, t.ciInstallations.repo],
        set: { targetType },
      })
      .returning();
    return row!;
  }

  /** Installations for one agent, scoped to its workspace via a join — never a bare agentId filter alone. */
  async listInstallationsForAgent(workspaceId: string, agentId: string): Promise<CiInstallationRow[]> {
    const rows = await this.db
      .select({ installation: t.ciInstallations })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.ciInstallations.agentId, agentId)));
    return rows.map((r) => r.installation);
  }

  /** All installations in a workspace (optionally filtered to one agent) — Refresh's scan target. */
  async listInstallationsForWorkspace(
    workspaceId: string,
    agentId?: string,
  ): Promise<CiInstallationRow[]> {
    const rows = await this.db
      .select({ installation: t.ciInstallations })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .where(
        and(
          eq(t.agents.workspaceId, workspaceId),
          agentId ? eq(t.ciInstallations.agentId, agentId) : undefined,
        ),
      );
    return rows.map((r) => r.installation);
  }

  /** One installation by id, scoped to its workspace via the same join (never a bare `getById`). */
  async getInstallationById(workspaceId: string, id: string): Promise<CiInstallationRow | undefined> {
    const rows = await this.db
      .select({ installation: t.ciInstallations })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.ciInstallations.id, id)));
    return rows[0]?.installation;
  }

  /**
   * Write one ingested run (AC-15/AC-16a). Idempotent: a retried Refresh for
   * the same `(ci_installation_id, github_run_id)` updates the existing row
   * instead of duplicating it — the DB-level unique constraint (with `NULLS
   * NOT DISTINCT`, migration 0018) is the arbiter.
   */
  async upsertRunFromArtifact(input: UpsertRunFromArtifact, tx?: Tx): Promise<CiRunRow> {
    const conn = tx ?? this.db;
    const [row] = await conn
      .insert(t.ciRuns)
      .values({
        ciInstallationId: input.ciInstallationId,
        prNumber: input.prNumber,
        ranAt: input.ranAt,
        status: input.status,
        findingsCount: input.findingsCount,
        costUsd: input.costUsd,
        githubUrl: input.githubUrl,
        source: input.source,
        commitSha: input.commitSha,
        githubRunId: input.githubRunId,
        durationMs: input.durationMs,
      })
      .onConflictDoUpdate({
        target: [t.ciRuns.ciInstallationId, t.ciRuns.githubRunId],
        set: {
          prNumber: input.prNumber,
          ranAt: input.ranAt,
          status: input.status,
          findingsCount: input.findingsCount,
          costUsd: input.costUsd,
          githubUrl: input.githubUrl,
          source: input.source,
          commitSha: input.commitSha,
          durationMs: input.durationMs,
        },
      })
      .returning();
    return row!;
  }

  /** Whether a run for this (installation, githubRunId) was already ingested — AC-15/16 idempotency check. */
  async hasRunForGithubRunId(
    ciInstallationId: string | null,
    githubRunId: string,
  ): Promise<boolean> {
    const rows = await this.db
      .select({ id: t.ciRuns.id })
      .from(t.ciRuns)
      .where(
        and(
          ciInstallationId === null
            ? isNull(t.ciRuns.ciInstallationId)
            : eq(t.ciRuns.ciInstallationId, ciInstallationId),
          eq(t.ciRuns.githubRunId, githubRunId),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  /** An agent's CI runs (its CI tab), scoped to the workspace via the installation→agent join. */
  async listRunsForAgent(
    workspaceId: string,
    agentId: string,
    limit = 50,
  ): Promise<{ run: CiRunRow; agentName: string | null; repo: string | null }[]> {
    const rows = await this.db
      .select({ run: t.ciRuns, agentName: t.agents.name, repo: t.ciInstallations.repo })
      .from(t.ciRuns)
      .innerJoin(t.ciInstallations, eq(t.ciRuns.ciInstallationId, t.ciInstallations.id))
      .innerJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.ciInstallations.agentId, agentId)))
      .orderBy(desc(t.ciRuns.ranAt))
      .limit(limit);
    return rows;
  }

  /**
   * The global CI Runs page. `ci_runs`/`ci_installations` carry no
   * `workspace_id` of their own, so this LEFT-joins through
   * `ci_installations` → `agents` and matches EITHER the caller's workspace
   * OR an orphaned run whose installation was already deleted (the spec's
   * own documented edge case: an agent delete cascades its installations,
   * `ci_runs.ci_installation_id` is `onDelete: 'set null'`, and that run
   * history is meant to keep surfacing here). This is an acceptable MVP
   * simplification, not a silent gap: `AuthProvider` is `LocalNoAuthProvider`
   * (one workspace) everywhere in this starter today — see
   * `server/src/adapters/auth/local.ts` — so there is no real second
   * workspace an orphaned row could leak across. Revisit if multi-workspace
   * auth ever ships.
   */
  async listRunsForWorkspace(
    workspaceId: string,
    filters: CiRunFilters = {},
  ): Promise<{ run: CiRunRow; agentName: string | null; repo: string | null }[]> {
    const rows = await this.db
      .select({ run: t.ciRuns, agentName: t.agents.name, repo: t.ciInstallations.repo })
      .from(t.ciRuns)
      .leftJoin(t.ciInstallations, eq(t.ciRuns.ciInstallationId, t.ciInstallations.id))
      .leftJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .where(
        and(
          or(eq(t.agents.workspaceId, workspaceId), isNull(t.ciRuns.ciInstallationId)),
          filters.agentId ? eq(t.ciInstallations.agentId, filters.agentId) : undefined,
          filters.repo ? eq(t.ciInstallations.repo, filters.repo) : undefined,
          filters.status ? eq(t.ciRuns.status, filters.status) : undefined,
        ),
      )
      .orderBy(desc(t.ciRuns.ranAt))
      .limit(filters.limit ?? 200);
    return rows;
  }
}
