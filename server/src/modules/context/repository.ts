import { and, asc, eq } from 'drizzle-orm';
import type { Db, Tx } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { dedupePaths } from './helpers.js';

/**
 * Project-context data-access. Owns `agent_context_docs` and
 * `skill_context_docs` (attached repo-relative doc paths) and the read side
 * that derives effective lists and `used_by_agents` from them plus the
 * existing `agent_skills` links. Paths are stored as given; existence in any
 * repo is never required.
 */
export class ContextRepository {
  constructor(private db: Db) {}

  /** The repo row, workspace-scoped (owner/name/clone state for reads). */
  async getRepo(workspaceId: string, repoId: string) {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  async agentPaths(agentId: string, conn: Db | Tx = this.db): Promise<string[]> {
    const rows = await conn
      .select({ path: t.agentContextDocs.path })
      .from(t.agentContextDocs)
      .where(eq(t.agentContextDocs.agentId, agentId))
      .orderBy(asc(t.agentContextDocs.order));
    return rows.map((r) => r.path);
  }

  async skillPaths(skillId: string, conn: Db | Tx = this.db): Promise<string[]> {
    const rows = await conn
      .select({ path: t.skillContextDocs.path })
      .from(t.skillContextDocs)
      .where(eq(t.skillContextDocs.skillId, skillId))
      .orderBy(asc(t.skillContextDocs.order));
    return rows.map((r) => r.path);
  }

  /** Replace the agent's full ordered list (order = index). Atomic. */
  async setAgentPaths(agentId: string, paths: string[], tx?: Tx): Promise<void> {
    const run = async (conn: Db | Tx): Promise<void> => {
      await conn.delete(t.agentContextDocs).where(eq(t.agentContextDocs.agentId, agentId));
      if (paths.length === 0) return;
      await conn
        .insert(t.agentContextDocs)
        .values(paths.map((path, i) => ({ agentId, path, order: i })));
    };
    return tx ? run(tx) : this.db.transaction((trx) => run(trx));
  }

  /** Replace the skill's full ordered list (order = index). Atomic. */
  async setSkillPaths(skillId: string, paths: string[], tx?: Tx): Promise<void> {
    const run = async (conn: Db | Tx): Promise<void> => {
      await conn.delete(t.skillContextDocs).where(eq(t.skillContextDocs.skillId, skillId));
      if (paths.length === 0) return;
      await conn
        .insert(t.skillContextDocs)
        .values(paths.map((path, i) => ({ skillId, path, order: i })));
    };
    return tx ? run(tx) : this.db.transaction((trx) => run(trx));
  }

  /**
   * Effective doc list for an agent (AC-10): its own docs in order, then each
   * linked AND enabled skill's docs in skill link order; first occurrence wins.
   */
  async effectivePaths(agentId: string): Promise<string[]> {
    const own = await this.agentPaths(agentId);
    const viaSkills = await this.db
      .select({ path: t.skillContextDocs.path })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.skills.id, t.agentSkills.skillId))
      .innerJoin(t.skillContextDocs, eq(t.skillContextDocs.skillId, t.skills.id))
      .where(and(eq(t.agentSkills.agentId, agentId), eq(t.skills.enabled, true)))
      .orderBy(asc(t.agentSkills.order), asc(t.skillContextDocs.order));
    return dedupePaths([...own, ...viaSkills.map((r) => r.path)]);
  }

  /**
   * `used_by_agents` per path (AC-11): distinct workspace agents (enabled or
   * not) whose effective list contains the path, directly or via an enabled
   * linked skill. Global by path, not repo-scoped.
   */
  async usedByCounts(workspaceId: string): Promise<Map<string, number>> {
    const direct = await this.db
      .select({ path: t.agentContextDocs.path, agentId: t.agents.id })
      .from(t.agentContextDocs)
      .innerJoin(t.agents, eq(t.agents.id, t.agentContextDocs.agentId))
      .where(eq(t.agents.workspaceId, workspaceId));
    const viaSkills = await this.db
      .select({ path: t.skillContextDocs.path, agentId: t.agents.id })
      .from(t.skillContextDocs)
      .innerJoin(t.skills, eq(t.skills.id, t.skillContextDocs.skillId))
      .innerJoin(t.agentSkills, eq(t.agentSkills.skillId, t.skills.id))
      .innerJoin(t.agents, eq(t.agents.id, t.agentSkills.agentId))
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.skills.enabled, true)));
    const byPath = new Map<string, Set<string>>();
    for (const r of [...direct, ...viaSkills]) {
      const set = byPath.get(r.path) ?? new Set<string>();
      set.add(r.agentId);
      byPath.set(r.path, set);
    }
    return new Map([...byPath].map(([p, s]) => [p, s.size]));
  }
}
