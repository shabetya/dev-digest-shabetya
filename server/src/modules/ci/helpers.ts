import type { CiFailOn, CiInstallation, CiRun, CiTarget, Finding } from '@devdigest/shared';
import { countBlockers } from '@devdigest/reviewer-core';
import type { CiInstallationRow, CiRunRow } from './repository.js';

/** Map a persisted `ci_installations` row to the public `CiInstallation` DTO. */
export function toCiInstallationDto(row: CiInstallationRow): CiInstallation {
  return {
    id: row.id,
    agent_id: row.agentId,
    repo: row.repo,
    target_type: row.targetType as CiTarget,
    installed_at: row.installedAt.toISOString(),
  };
}

/** Map a persisted `ci_runs` row (+ its joined agent name) to the public `CiRun` DTO. */
export function toCiRunDto(row: CiRunRow, agentName: string | null): CiRun {
  return {
    id: row.id,
    ci_installation_id: row.ciInstallationId,
    pr_number: row.prNumber,
    ran_at: row.ranAt ? row.ranAt.toISOString() : null,
    status: row.status,
    findings_count: row.findingsCount,
    cost_usd: row.costUsd,
    github_url: row.githubUrl,
    source: row.source,
    agent: agentName,
    // AC-17: `ci_runs.duration_ms` (migration 0019) holds the ingested
    // `CiResultArtifact.duration_ms`; `CiRun.duration_s` is seconds, so convert.
    duration_s: row.durationMs != null ? row.durationMs / 1000 : null,
  };
}

/** `name` → kebab-case slug, deduped against `taken` (appends -2, -3, … on collision). */
export function slugify(name: string, taken: Set<string> = new Set()): string {
  const base =
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'agent';
  let slug = base;
  let i = 2;
  while (taken.has(slug)) {
    slug = `${base}-${i}`;
    i++;
  }
  taken.add(slug);
  return slug;
}

/**
 * Build minimal stub `Finding`s from per-severity counts (all a `CiResultArtifact`
 * carries) so the Refresh-ingestion verdict can be derived by calling the SAME
 * `countBlockers` the local run-executor and `agent-runner` both use — never a
 * local reimplementation of the severity-rank gate (PLAN-05's Constraints).
 * Only `.severity` is read by `countBlockers`; the rest are placeholders.
 */
export function syntheticFindingsFromCounts(counts: {
  critical: number;
  warning: number;
  suggestion: number;
}): Finding[] {
  const make = (severity: Finding['severity'], n: number): Finding[] =>
    Array.from({ length: Math.max(0, n) }, () => ({
      id: 'synthetic',
      severity,
      category: 'bug',
      title: '',
      file: '',
      start_line: 1,
      end_line: 1,
      rationale: '',
      confidence: 1,
    })) as Finding[];
  return [
    ...make('CRITICAL', counts.critical),
    ...make('WARNING', counts.warning),
    ...make('SUGGESTION', counts.suggestion),
  ];
}

/** `succeeded` | `failed` | `no_findings`, derived deterministically — never `running` for an already-ingested artifact. */
export function deriveRunStatus(
  counts: { critical: number; warning: number; suggestion: number },
  failOn: CiFailOn,
): 'succeeded' | 'failed' | 'no_findings' {
  const total = counts.critical + counts.warning + counts.suggestion;
  if (total === 0) return 'no_findings';
  const findings = syntheticFindingsFromCounts(counts);
  return countBlockers(findings, failOn) > 0 ? 'failed' : 'succeeded';
}
