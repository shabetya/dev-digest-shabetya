import { describe, expect, it } from 'vitest';
import type { Agent, FindingRecord, ReviewRecord } from '../src/api-types.js';
import { toAgentSummary, toFindingSummary, toReviewResult } from '../src/shape.js';

describe('toAgentSummary', () => {
  it('trims an Agent down to id/name/provider/model/enabled', () => {
    const agent: Agent = {
      id: 'agent-1',
      name: 'Security Bot',
      provider: 'openai',
      model: 'gpt-4.1',
      enabled: true,
    };
    expect(toAgentSummary(agent)).toEqual({
      id: 'agent-1',
      name: 'Security Bot',
      provider: 'openai',
      model: 'gpt-4.1',
      enabled: true,
    });
  });
});

const FINDING: FindingRecord = {
  id: 'f1',
  severity: 'CRITICAL',
  category: 'security',
  title: 'Hardcoded secret',
  file: 'src/config.ts',
  start_line: 10,
  end_line: 12,
  rationale: 'Secret is committed in plain text.',
  suggestion: 'Move it to SecretsProvider.',
  confidence: 0.9,
};

describe('toFindingSummary', () => {
  it('shapes a finding record and defaults a missing suggestion to null', () => {
    expect(toFindingSummary(FINDING)).toEqual({
      id: 'f1',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded secret',
      file: 'src/config.ts',
      start_line: 10,
      end_line: 12,
      rationale: 'Secret is committed in plain text.',
      suggestion: 'Move it to SecretsProvider.',
      confidence: 0.9,
    });

    const { suggestion, ...withoutSuggestion } = FINDING;
    expect(toFindingSummary(withoutSuggestion).suggestion).toBeNull();
  });
});

describe('toReviewResult', () => {
  it('shapes a review record, including nested findings, dropping raw-payload noise', () => {
    const review: ReviewRecord = {
      id: 'review-1',
      pr_id: 'pr-1',
      agent_id: 'agent-1',
      run_id: 'run-1',
      agent_name: 'Security Bot',
      kind: 'review',
      verdict: 'request_changes',
      summary: 'Found one critical issue.',
      score: 40,
      model: 'gpt-4.1',
      created_at: '2026-01-01T00:00:00.000Z',
      findings: [FINDING],
    };

    expect(toReviewResult(review)).toEqual({
      review_id: 'review-1',
      agent_id: 'agent-1',
      agent_name: 'Security Bot',
      verdict: 'request_changes',
      summary: 'Found one critical issue.',
      score: 40,
      model: 'gpt-4.1',
      created_at: '2026-01-01T00:00:00.000Z',
      findings: [toFindingSummary(FINDING)],
    });
  });
});
