import type { AgentColumn, AgentColumnFinding, Conflict, ConflictTake } from '@devdigest/shared';
import type { AgentRunRow, FindingRow } from '../../db/rows.js';
import type { MultiAgentColumnData } from './repository.js';

/**
 * Multi-Agent Review (SPEC-05) — pure mapping + the deterministic
 * cross-agent location-matching rule. No DB/LLM access here; `multi-agent-
 * service.ts` is the only caller, and tests exercise these functions
 * directly with plain row fixtures.
 */

const ACTIVE_STATUSES = new Set<AgentColumn['status']>(['running']);

/** `agent_runs.status` is nullable; a null status (row created but never
 *  transitioned) reads as still `'running'` for display purposes. */
function toColumnStatus(status: AgentRunRow['status']): AgentColumn['status'] {
  return status ?? 'running';
}

export function toAgentColumnFinding(f: FindingRow): AgentColumnFinding {
  return {
    id: f.id,
    severity: f.severity,
    category: f.category,
    title: f.title,
    file: f.file,
    start_line: f.startLine,
    kind: f.kind,
    confidence: f.confidence,
    rationale: f.rationale,
    suggestion: f.suggestion,
    accepted_at: f.acceptedAt ? f.acceptedAt.toISOString() : null,
    dismissed_at: f.dismissedAt ? f.dismissedAt.toISOString() : null,
  };
}

/** Map one resolved column (snapshot entry + its live run, or none) to the
 *  wire `AgentColumn` — the "run deleted" placeholder when `run` is null. */
export function toAgentColumn(data: MultiAgentColumnData): AgentColumn {
  if (!data.run) {
    return {
      run_id: null,
      agent_id: data.agentId,
      agent_name: data.agentName,
      provider: null,
      model: null,
      status: 'deleted',
      verdict: null,
      score: null,
      summary: null,
      duration_ms: null,
      cost_usd: null,
      findings: [],
    };
  }
  const run = data.run;
  return {
    run_id: run.id,
    agent_id: data.agentId,
    agent_name: data.agentName,
    provider: run.provider,
    model: run.model,
    status: toColumnStatus(run.status),
    // `agent_runs` has no persisted verdict column — findings/score are what
    // observability surfaces; verdict lives on the `reviews` row, which this
    // column view intentionally doesn't need (findings carry severity).
    verdict: null,
    score: run.score,
    summary: null,
    duration_ms: run.durationMs,
    cost_usd: run.costUsd,
    findings: data.findings.map(toAgentColumnFinding),
  };
}

/**
 * Short-circuit for conflict computation (performance note from planning):
 * never worth the file+line-overlap matching pass when there's nothing to
 * compare (AC-17, <2 columns) or when most columns haven't produced their
 * findings yet (still `'running'`) — a poll mid-flight would otherwise re-run
 * the whole matching pass against partial data on every tick for no payoff,
 * since the result is thrown away the moment more findings land.
 */
export function shouldComputeConflicts(columns: AgentColumn[]): boolean {
  if (columns.length < 2) return false;
  const runningCount = columns.filter((c) => ACTIVE_STATUSES.has(c.status)).length;
  return runningCount < columns.length / 2;
}

interface LocationGroup {
  file: string;
  minLine: number;
  maxLine: number;
  entries: { agentId: string; agentName: string; finding: FindingRow }[];
}

/** Deterministic file + overlapping-line-range clustering (v1 scope per
 *  Clarifications #2 — no LLM/embeddings). Sweeps findings sorted by
 *  (file, start_line), merging into the running group when the same file and
 *  the line ranges overlap. */
function groupByLocation(
  entries: { agentId: string; agentName: string; finding: FindingRow }[],
): LocationGroup[] {
  const sorted = [...entries].sort((a, b) => {
    if (a.finding.file !== b.finding.file) return a.finding.file < b.finding.file ? -1 : 1;
    return a.finding.startLine - b.finding.startLine;
  });
  const groups: LocationGroup[] = [];
  for (const entry of sorted) {
    const last = groups[groups.length - 1];
    const { file, startLine, endLine } = entry.finding;
    if (last && last.file === file && startLine <= last.maxLine) {
      last.entries.push(entry);
      last.minLine = Math.min(last.minLine, startLine);
      last.maxLine = Math.max(last.maxLine, endLine);
    } else {
      groups.push({ file, minLine: startLine, maxLine: endLine, entries: [entry] });
    }
  }
  return groups;
}

/**
 * Build the `conflicts` list: one block per distinct flagged location, with
 * EVERY participating agent's verdict there (including `'ignored'` for an
 * agent that reviewed but raised nothing at that spot — AC-16). Includes
 * full-agreement locations too; the "Show only conflicts" filter (AC-18) is
 * applied client-side over this complete list.
 *
 * `allAgents` is every column that participated (including failed/deleted
 * ones, per the edge case: an agent that failed/was deleted is "did not flag
 * anything", not silently excluded from the comparison).
 */
export function computeConflicts(
  allAgents: { agentId: string; agentName: string }[],
  findingsByAgent: { agentId: string; agentName: string; findings: FindingRow[] }[],
): Conflict[] {
  const entries = findingsByAgent.flatMap(({ agentId, agentName, findings }) =>
    findings.map((finding) => ({ agentId, agentName, finding })),
  );
  if (entries.length === 0) return [];

  const groups = groupByLocation(entries);

  return groups.map((group) => {
    // Representative title: the highest-severity finding in the group (ties
    // broken by encounter order from the deterministic sort above).
    const severityRank: Record<string, number> = { CRITICAL: 2, WARNING: 1, SUGGESTION: 0 };
    const headline = [...group.entries].sort(
      (a, b) => (severityRank[b.finding.severity] ?? 0) - (severityRank[a.finding.severity] ?? 0),
    )[0]!;

    const takes: ConflictTake[] = allAgents.map((agent) => {
      const own = group.entries.filter((e) => e.agentId === agent.agentId);
      if (own.length === 0) {
        return {
          agent_id: agent.agentId,
          persona: agent.agentName,
          verdict: 'ignored',
          note: 'Did not flag this location.',
        };
      }
      const worst = [...own].sort(
        (a, b) => (severityRank[b.finding.severity] ?? 0) - (severityRank[a.finding.severity] ?? 0),
      )[0]!;
      return {
        agent_id: agent.agentId,
        persona: agent.agentName,
        verdict: worst.finding.severity,
        note: worst.finding.title,
      };
    });

    return {
      file: group.file,
      line: headline.finding.startLine,
      title: headline.finding.title,
      takes,
    };
  });
}
