import { describe, it, expect } from 'vitest';
import { computeSkillStats } from '../src/modules/skills/helpers.js';
import type { SkillStatsRow, SkillStatsUsingAgentRow } from '../src/modules/skills/repository.js';

/**
 * Unit coverage for the Stats tab's pure aggregation — no DB, hand-built rows
 * shaped exactly like SkillsRepository.getStats's flat (run × finding) join.
 */

const NOW = new Date('2026-06-15T00:00:00Z');
const RECENT = new Date('2026-06-10T00:00:00Z'); // 5 days ago
const OLD = new Date('2026-04-01T00:00:00Z'); // >30 days ago

function row(overrides: Partial<SkillStatsRow>): SkillStatsRow {
  return {
    runId: 'run-1',
    status: 'done',
    ranAt: RECENT,
    costUsd: 0.01,
    reviewId: 'review-1',
    verdict: 'comment',
    findingCategory: null,
    acceptedAt: null,
    dismissedAt: null,
    ...overrides,
  };
}

const agents: SkillStatsUsingAgentRow[] = [{ id: 'agent-1', name: 'Test Quality Reviewer', enabled: true }];

describe('computeSkillStats', () => {
  it('returns an all-zero/null shape for no runs', () => {
    const stats = computeSkillStats('skill-1', [], [], NOW);
    expect(stats).toMatchObject({
      skill_id: 'skill-1',
      used_by_agents: [],
      runs_total: 0,
      runs_done: 0,
      request_changes_rate: null,
      findings_total: 0,
      accept_rate: null,
      dismiss_rate: null,
      findings_by_category: [],
      avg_cost_usd: null,
      last_run_at: null,
    });
  });

  it('counts a run with zero findings without inflating findings_total', () => {
    const rows = [row({ runId: 'run-1', findingCategory: null })];
    const stats = computeSkillStats('skill-1', rows, agents, NOW);
    expect(stats.runs_total).toBe(1);
    expect(stats.runs_done).toBe(1);
    expect(stats.findings_total).toBe(0);
  });

  it('splits findings into accepted/dismissed/pending and computes both rates', () => {
    const rows = [
      row({ runId: 'run-1', findingCategory: 'security', acceptedAt: RECENT, dismissedAt: null }),
      row({ runId: 'run-1', findingCategory: 'bug', acceptedAt: null, dismissedAt: RECENT }),
      row({ runId: 'run-1', findingCategory: 'style', acceptedAt: null, dismissedAt: null }),
    ];
    const stats = computeSkillStats('skill-1', rows, agents, NOW);
    expect(stats.findings_total).toBe(3);
    expect(stats.accepted).toBe(1);
    expect(stats.dismissed).toBe(1);
    expect(stats.pending).toBe(1);
    // pending findings don't count toward either rate's denominator
    expect(stats.accept_rate).toBe(0.5);
    expect(stats.dismiss_rate).toBe(0.5);
  });

  it('orders findings_by_category by fixed enum order, omitting zero-count categories', () => {
    const rows = [
      row({ runId: 'run-1', findingCategory: 'test' }),
      row({ runId: 'run-1', findingCategory: 'bug' }),
      row({ runId: 'run-1', findingCategory: 'bug' }),
    ];
    const stats = computeSkillStats('skill-1', rows, agents, NOW);
    expect(stats.findings_by_category).toEqual([
      { category: 'bug', count: 2 },
      { category: 'test', count: 1 },
    ]);
  });

  it('excludes a finding older than 30 days from findings_last_30d but still counts it in findings_total', () => {
    const rows = [
      row({ runId: 'run-1', ranAt: RECENT, findingCategory: 'bug' }),
      row({ runId: 'run-2', ranAt: OLD, findingCategory: 'bug' }),
    ];
    const stats = computeSkillStats('skill-1', rows, agents, NOW);
    expect(stats.findings_total).toBe(2);
    expect(stats.findings_last_30d).toBe(1);
  });

  it('treats a run with no review row as having no verdict, excluded from request_changes_rate', () => {
    const rows = [
      row({ runId: 'run-1', reviewId: null, verdict: null, findingCategory: null }),
      row({ runId: 'run-2', reviewId: 'review-2', verdict: 'request_changes', findingCategory: null }),
    ];
    const stats = computeSkillStats('skill-1', rows, agents, NOW);
    // only run-2 has a review row, and it requested changes → rate is 1, not 0.5
    expect(stats.request_changes_rate).toBe(1);
  });

  it('excludes failed/cancelled runs from runs_done, avg_cost_usd, and request_changes_rate', () => {
    const rows = [
      row({ runId: 'run-1', status: 'done', costUsd: 0.02, verdict: 'request_changes', findingCategory: null }),
      row({ runId: 'run-2', status: 'failed', costUsd: null, reviewId: null, verdict: null, findingCategory: null }),
    ];
    const stats = computeSkillStats('skill-1', rows, agents, NOW);
    expect(stats.runs_total).toBe(2);
    expect(stats.runs_done).toBe(1);
    expect(stats.avg_cost_usd).toBe(0.02);
    expect(stats.request_changes_rate).toBe(1);
  });

  it('dedupes a run fanned out over multiple finding rows for run-level metrics', () => {
    const rows = [
      row({ runId: 'run-1', costUsd: 0.05, findingCategory: 'bug' }),
      row({ runId: 'run-1', costUsd: 0.05, findingCategory: 'security' }),
      row({ runId: 'run-1', costUsd: 0.05, findingCategory: 'perf' }),
    ];
    const stats = computeSkillStats('skill-1', rows, agents, NOW);
    expect(stats.runs_total).toBe(1);
    expect(stats.avg_cost_usd).toBe(0.05); // averaged over 1 distinct run, not 3 rows
    expect(stats.findings_total).toBe(3);
  });

  it('maps usedByAgents rows to the public snake_case DTO shape', () => {
    const stats = computeSkillStats('skill-1', [], agents, NOW);
    expect(stats.used_by_agents).toEqual([
      { agent_id: 'agent-1', agent_name: 'Test Quality Reviewer', agent_enabled: true },
    ]);
  });
});
