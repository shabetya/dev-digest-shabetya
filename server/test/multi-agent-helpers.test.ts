import { describe, it, expect } from 'vitest';
import type { AgentColumn } from '@devdigest/shared';
import type { FindingRow } from '../src/db/rows.js';
import {
  computeConflicts,
  shouldComputeConflicts,
  toAgentColumn,
  toAgentColumnFinding,
} from '../src/modules/reviews/multi-agent-helpers.js';
import type { MultiAgentColumnData } from '../src/modules/reviews/repository.js';

function finding(overrides: Partial<FindingRow> & Pick<FindingRow, 'id'>): FindingRow {
  return {
    reviewId: 'rev-1',
    file: 'src/x.ts',
    startLine: 1,
    endLine: 1,
    severity: 'WARNING',
    category: 'bug',
    title: 'A finding',
    rationale: 'because',
    suggestion: null,
    confidence: 0.8,
    kind: 'finding',
    trifectaComponents: null,
    acceptedAt: null,
    dismissedAt: null,
    inScope: null,
    ...overrides,
  } as unknown as FindingRow;
}

function runRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'run-1',
    workspaceId: 'ws-1',
    agentId: 'a1',
    prId: 'pr-1',
    ranAt: new Date('2024-01-01T00:00:00Z'),
    provider: 'openai',
    model: 'gpt-4.1',
    durationMs: 1000,
    tokensIn: 10,
    tokensOut: 20,
    costUsd: 0.05,
    status: 'done',
    error: null,
    source: 'local',
    findingsCount: 1,
    grounding: '1/1 passed',
    score: 90,
    blockers: 0,
    multiAgentRunId: 'multi-1',
    ...overrides,
  } as never;
}

describe('toAgentColumn', () => {
  it('maps a live run to a column with its findings', () => {
    const data: MultiAgentColumnData = {
      agentId: 'a1',
      agentName: 'Security',
      run: runRow(),
      findings: [finding({ id: 'f1' })],
    };
    const column = toAgentColumn(data);
    expect(column.status).toBe('done');
    expect(column.run_id).toBe('run-1');
    expect(column.findings).toHaveLength(1);
    expect(column.findings[0]!.confidence).toBe(0.8);
  });

  it('renders a "run deleted" placeholder when the agent_runs row is gone', () => {
    const data: MultiAgentColumnData = {
      agentId: 'a1',
      agentName: 'Security',
      run: null,
      findings: [],
    };
    const column = toAgentColumn(data);
    expect(column.status).toBe('deleted');
    expect(column.run_id).toBeNull();
    expect(column.findings).toEqual([]);
  });

  it('a null agent_runs.status reads as still running', () => {
    const data: MultiAgentColumnData = {
      agentId: 'a1',
      agentName: 'Security',
      run: runRow({ status: null }),
      findings: [],
    };
    expect(toAgentColumn(data).status).toBe('running');
  });
});

describe('toAgentColumnFinding', () => {
  it('maps a FindingRow to the wire shape including accept/dismiss state', () => {
    const accepted = new Date('2024-02-01T00:00:00Z');
    const f = toAgentColumnFinding(finding({ id: 'f1', acceptedAt: accepted }));
    expect(f.id).toBe('f1');
    expect(f.accepted_at).toBe(accepted.toISOString());
    expect(f.dismissed_at).toBeNull();
  });
});

describe('shouldComputeConflicts', () => {
  const done = (id: string): AgentColumn => ({
    run_id: id,
    agent_id: id,
    agent_name: id,
    provider: null,
    model: null,
    status: 'done',
    verdict: null,
    score: 90,
    summary: null,
    duration_ms: 100,
    cost_usd: 0.01,
    findings: [],
  });
  const running = (id: string): AgentColumn => ({ ...done(id), status: 'running' });

  it('is false for fewer than 2 columns (AC-17)', () => {
    expect(shouldComputeConflicts([done('a')])).toBe(false);
    expect(shouldComputeConflicts([])).toBe(false);
  });

  it('is false when at least half the columns are still running', () => {
    expect(shouldComputeConflicts([running('a'), running('b')])).toBe(false);
    expect(shouldComputeConflicts([running('a'), done('b')])).toBe(false);
  });

  it('is true for 2+ columns once most are no longer running', () => {
    expect(shouldComputeConflicts([done('a'), done('b')])).toBe(true);
    expect(shouldComputeConflicts([done('a'), done('b'), running('c')])).toBe(true);
  });
});

describe('computeConflicts', () => {
  const agents = [
    { agentId: 'a1', agentName: 'Security' },
    { agentId: 'a2', agentName: 'Performance' },
  ];

  it('returns [] when nobody flagged anything', () => {
    expect(
      computeConflicts(agents, [
        { agentId: 'a1', agentName: 'Security', findings: [] },
        { agentId: 'a2', agentName: 'Performance', findings: [] },
      ]),
    ).toEqual([]);
  });

  it('groups overlapping file+line findings into one location and marks the other agent "ignored" (AC-16)', () => {
    const conflicts = computeConflicts(agents, [
      {
        agentId: 'a1',
        agentName: 'Security',
        findings: [
          finding({ id: 'f1', file: 'src/x.ts', startLine: 10, endLine: 12, severity: 'CRITICAL' }),
        ],
      },
      { agentId: 'a2', agentName: 'Performance', findings: [] },
    ]);
    expect(conflicts).toHaveLength(1);
    const [c] = conflicts;
    expect(c!.file).toBe('src/x.ts');
    const takeByAgent = Object.fromEntries(c!.takes.map((t) => [t.agent_id, t.verdict]));
    expect(takeByAgent.a1).toBe('CRITICAL');
    expect(takeByAgent.a2).toBe('ignored');
  });

  it('merges findings whose line ranges overlap into a single location', () => {
    const conflicts = computeConflicts(agents, [
      {
        agentId: 'a1',
        agentName: 'Security',
        findings: [finding({ id: 'f1', file: 'src/x.ts', startLine: 10, endLine: 15 })],
      },
      {
        agentId: 'a2',
        agentName: 'Performance',
        findings: [finding({ id: 'f2', file: 'src/x.ts', startLine: 12, endLine: 20 })],
      },
    ]);
    expect(conflicts).toHaveLength(1);
  });

  it('treats a failed agent run (zero findings) as "ignored", not excluded or agreeing (AC-16/18 edge case)', () => {
    // Three columns in the multi-run: one failed mid-run (no findings to
    // compare), one with a real finding at the shared location, one clean.
    // The failed agent must still appear in `takes` with verdict 'ignored' —
    // same as a healthy agent that simply raised nothing there — not dropped
    // from the conflict, and not mis-classified as agreeing with the flagger.
    const threeAgents = [
      { agentId: 'a1', agentName: 'Security' },
      { agentId: 'a2', agentName: 'Performance' },
      { agentId: 'a3', agentName: 'Flaky' },
    ];
    const conflicts = computeConflicts(threeAgents, [
      {
        agentId: 'a1',
        agentName: 'Security',
        findings: [
          finding({ id: 'f1', file: 'src/x.ts', startLine: 10, endLine: 12, severity: 'CRITICAL' }),
        ],
      },
      { agentId: 'a2', agentName: 'Performance', findings: [] },
      // a3's agent_runs row is status: 'failed' — it produced no grounded
      // findings, so from computeConflicts' perspective it's indistinguishable
      // from a healthy agent that found nothing: an empty findings array.
      { agentId: 'a3', agentName: 'Flaky', findings: [] },
    ]);

    expect(conflicts).toHaveLength(1);
    const [c] = conflicts;
    const takeByAgent = Object.fromEntries(c!.takes.map((t) => [t.agent_id, t.verdict]));
    expect(Object.keys(takeByAgent)).toHaveLength(3);
    expect(takeByAgent.a1).toBe('CRITICAL');
    expect(takeByAgent.a2).toBe('ignored');
    expect(takeByAgent.a3).toBe('ignored');
  });

  it('keeps non-overlapping findings in the same file as separate locations', () => {
    const conflicts = computeConflicts(agents, [
      {
        agentId: 'a1',
        agentName: 'Security',
        findings: [finding({ id: 'f1', file: 'src/x.ts', startLine: 1, endLine: 1 })],
      },
      {
        agentId: 'a2',
        agentName: 'Performance',
        findings: [finding({ id: 'f2', file: 'src/x.ts', startLine: 100, endLine: 100 })],
      },
    ]);
    expect(conflicts).toHaveLength(2);
  });
});
