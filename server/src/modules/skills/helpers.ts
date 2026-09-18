import type { Skill, SkillSource, SkillStats, SkillFindingsByCategory, SkillType } from '@devdigest/shared';
import type {
  SkillRow,
  SkillVersionRow,
  SkillStatsRow,
  SkillStatsUsingAgentRow,
} from './repository.js';

/** Pure helpers for the skills module — DB row ⇄ DTO mapping. No I/O. */

/** Map a persisted skill row to the public `Skill` DTO. */
export function toSkillDto(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
  };
}

/** Public shape of a `skill_versions` row (snake_case, like every other DTO
    in this API — the DB row itself is camelCase internal storage). */
export interface SkillVersionDto {
  skill_id: string;
  version: number;
  body: string;
  created_at: string;
}

export function toSkillVersionDto(row: SkillVersionRow): SkillVersionDto {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    created_at: row.createdAt.toISOString(),
  };
}

/** Fixed display order for the findings-by-category donut (stable legend
    across renders, rather than count-descending). */
const CATEGORY_ORDER = ['bug', 'security', 'perf', 'style', 'test'] as const;

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Reduce the flat (run × finding) rows from `SkillsRepository.getStats` into
 * the `SkillStats` DTO. Pure — no I/O, unit-testable with hand-built rows.
 */
export function computeSkillStats(
  skillId: string,
  rows: SkillStatsRow[],
  usedByAgents: SkillStatsUsingAgentRow[],
  now: Date,
): SkillStats {
  const runsById = new Map<string, SkillStatsRow>();
  for (const row of rows) {
    if (!runsById.has(row.runId)) runsById.set(row.runId, row);
  }
  const runs = [...runsById.values()];
  const doneRuns = runs.filter((r) => r.status === 'done');

  const costs = doneRuns
    .map((r) => r.costUsd)
    .filter((c): c is number => c != null);
  const avgCostUsd = costs.length > 0 ? costs.reduce((a, b) => a + b, 0) / costs.length : null;

  const lastRunAt =
    runs.length > 0 ? new Date(Math.max(...runs.map((r) => r.ranAt.getTime()))).toISOString() : null;

  // "Pull frequency" reading: share of this skill's DONE runs (that have a
  // persisted review) whose review requested changes.
  const doneWithReview = doneRuns.filter((r) => r.reviewId != null);
  const requestChangesRate =
    doneWithReview.length > 0
      ? doneWithReview.filter((r) => r.verdict === 'request_changes').length / doneWithReview.length
      : null;

  const thirtyDaysAgo = now.getTime() - THIRTY_DAYS_MS;
  let findingsTotal = 0;
  let findingsLast30d = 0;
  let accepted = 0;
  let dismissed = 0;
  let pending = 0;
  const categoryCounts = new Map<string, number>();

  for (const row of rows) {
    if (row.findingCategory == null) continue; // a run-with-no-findings placeholder row
    findingsTotal++;
    if (row.ranAt.getTime() >= thirtyDaysAgo) findingsLast30d++;
    if (row.acceptedAt != null) accepted++;
    else if (row.dismissedAt != null) dismissed++;
    else pending++;
    categoryCounts.set(row.findingCategory, (categoryCounts.get(row.findingCategory) ?? 0) + 1);
  }

  const decided = accepted + dismissed;
  const acceptRate = decided > 0 ? accepted / decided : null;
  const dismissRate = decided > 0 ? dismissed / decided : null;

  const findingsByCategory: SkillFindingsByCategory[] = CATEGORY_ORDER.filter(
    (c) => (categoryCounts.get(c) ?? 0) > 0,
  ).map((c) => ({ category: c, count: categoryCounts.get(c)! }));

  return {
    skill_id: skillId,
    used_by_agents: usedByAgents.map((a) => ({
      agent_id: a.id,
      agent_name: a.name,
      agent_enabled: a.enabled,
    })),
    runs_total: runs.length,
    runs_done: doneRuns.length,
    request_changes_rate: requestChangesRate,
    findings_total: findingsTotal,
    findings_last_30d: findingsLast30d,
    accepted,
    dismissed,
    pending,
    accept_rate: acceptRate,
    dismiss_rate: dismissRate,
    findings_by_category: findingsByCategory,
    avg_cost_usd: avgCostUsd,
    last_run_at: lastRunAt,
  };
}
