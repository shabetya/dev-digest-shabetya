import { describe, it, expect } from 'vitest';
import { deriveRunStatus, slugify, syntheticFindingsFromCounts, toCiInstallationDto, toCiRunDto } from './helpers.js';
import type { CiInstallationRow, CiRunRow } from './repository.js';

describe('slugify', () => {
  it('kebab-cases a name and dedupes collisions', () => {
    const taken = new Set<string>();
    expect(slugify('Security Reviewer', taken)).toBe('security-reviewer');
    expect(slugify('Security Reviewer', taken)).toBe('security-reviewer-2');
    expect(slugify('  Weird!! Name__', taken)).toBe('weird-name');
  });

  it('falls back to "agent" for an empty/symbols-only name', () => {
    expect(slugify('!!!')).toBe('agent');
  });
});

describe('syntheticFindingsFromCounts / deriveRunStatus', () => {
  it('builds exactly the right number of stub findings per severity', () => {
    const findings = syntheticFindingsFromCounts({ critical: 2, warning: 1, suggestion: 0 });
    expect(findings.filter((f) => f.severity === 'CRITICAL')).toHaveLength(2);
    expect(findings.filter((f) => f.severity === 'WARNING')).toHaveLength(1);
    expect(findings.filter((f) => f.severity === 'SUGGESTION')).toHaveLength(0);
  });

  it('derives no_findings / succeeded / failed deterministically from counts + gate', () => {
    expect(deriveRunStatus({ critical: 0, warning: 0, suggestion: 0 }, 'critical')).toBe('no_findings');
    expect(deriveRunStatus({ critical: 0, warning: 1, suggestion: 0 }, 'critical')).toBe('succeeded');
    expect(deriveRunStatus({ critical: 1, warning: 0, suggestion: 0 }, 'critical')).toBe('failed');
    expect(deriveRunStatus({ critical: 1, warning: 0, suggestion: 0 }, 'never')).toBe('succeeded');
  });
});

describe('DTO mapping', () => {
  it('maps a ci_installations row to the public DTO', () => {
    const row = {
      id: 'i1',
      agentId: 'a1',
      repo: 'acme/payments-api',
      targetType: 'gha',
      installedAt: new Date('2026-01-01T00:00:00Z'),
    } as CiInstallationRow;
    expect(toCiInstallationDto(row)).toEqual({
      id: 'i1',
      agent_id: 'a1',
      repo: 'acme/payments-api',
      target_type: 'gha',
      installed_at: '2026-01-01T00:00:00.000Z',
    });
  });

  it('maps a ci_runs row + joined agent name to the public DTO', () => {
    const row = {
      id: 'r1',
      ciInstallationId: 'i1',
      prNumber: 42,
      ranAt: new Date('2026-01-02T00:00:00Z'),
      status: 'succeeded',
      findingsCount: 3,
      costUsd: 0.05,
      githubUrl: 'https://github.com/acme/payments-api/actions/runs/1',
      source: 'gha',
      commitSha: 'abc123',
      githubRunId: '1',
    } as CiRunRow;
    expect(toCiRunDto(row, 'Security Reviewer')).toMatchObject({
      id: 'r1',
      ci_installation_id: 'i1',
      pr_number: 42,
      status: 'succeeded',
      findings_count: 3,
      agent: 'Security Reviewer',
    });
  });

  it('converts a persisted duration_ms into CiRun.duration_s (seconds), and null stays null (Fix B / AC-17)', () => {
    const base = {
      id: 'r1',
      ciInstallationId: 'i1',
      prNumber: 42,
      ranAt: new Date('2026-01-02T00:00:00Z'),
      status: 'succeeded',
      findingsCount: 3,
      costUsd: 0.05,
      githubUrl: 'https://github.com/acme/payments-api/actions/runs/1',
      source: 'gha',
      commitSha: 'abc123',
      githubRunId: '1',
    };
    expect(toCiRunDto({ ...base, durationMs: 64000 } as CiRunRow, null).duration_s).toBe(64);
    expect(toCiRunDto({ ...base, durationMs: null } as CiRunRow, null).duration_s).toBeNull();
  });
});
