import { describe, it, expect } from 'vitest';
import { buildResultArtifact, exitCodeFor, redactSecret } from './result.js';
import type { Finding } from '@devdigest/shared';
import type { ReviewOutcome } from '@devdigest/reviewer-core';

function finding(severity: Finding['severity']): Finding {
  return {
    id: 'f1',
    severity,
    category: 'security',
    title: 't',
    file: 'a.ts',
    start_line: 1,
    end_line: 1,
    rationale: 'r',
    confidence: 0.9,
  } as Finding;
}

describe('buildResultArtifact (Fix B / AC-17)', () => {
  const outcome = {
    review: { findings: [finding('WARNING')], verdict: 'comment', summary: 's', score: 80 },
    costUsd: 0.02,
  } as unknown as ReviewOutcome;

  it('carries the caller-measured duration through to the artifact, and defaults to null when omitted', () => {
    const withDuration = buildResultArtifact({ outcome, agentName: 'Test Agent', prNumber: 1, durationMs: 1234 });
    expect(withDuration.duration_ms).toBe(1234);

    const withoutDuration = buildResultArtifact({ outcome, agentName: 'Test Agent', prNumber: 1 });
    expect(withoutDuration.duration_ms).toBeNull();
  });
});

describe('exitCodeFor (AC-14)', () => {
  it('exits non-zero when a finding trips the gate, zero otherwise', () => {
    expect(exitCodeFor([finding('CRITICAL')], 'critical')).toBe(1);
    expect(exitCodeFor([finding('WARNING')], 'critical')).toBe(0);
    expect(exitCodeFor([], 'any')).toBe(0);
    expect(exitCodeFor([finding('SUGGESTION')], 'never')).toBe(0);
  });
});

describe('redactSecret (AC-10)', () => {
  it('strips the literal secret value out of a string', () => {
    const secret = 'sk-or-v1-abc123';
    const text = `request failed: Authorization: Bearer ${secret}`;
    expect(redactSecret(text, secret)).not.toContain(secret);
    expect(redactSecret('no secret here', undefined)).toBe('no secret here');
  });
});
