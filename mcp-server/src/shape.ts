import type { Agent, FindingRecord, ReviewRecord } from './api-types.js';

/**
 * Response-shaping helpers shared by every tool. Cross-cutting convention:
 * return only the fields the caller needs, never the full raw REST payload.
 */

export interface AgentSummary {
  id: string;
  name: string;
  provider: string;
  model: string;
  enabled: boolean;
}

export function toAgentSummary(agent: Agent): AgentSummary {
  return {
    id: agent.id,
    name: agent.name,
    provider: agent.provider,
    model: agent.model,
    enabled: agent.enabled,
  };
}

export interface FindingSummary {
  id: string;
  severity: string;
  category: string;
  title: string;
  file: string;
  start_line: number;
  end_line: number;
  rationale: string;
  suggestion?: string | null;
  confidence: number;
}

export function toFindingSummary(finding: FindingRecord): FindingSummary {
  return {
    id: finding.id,
    severity: finding.severity,
    category: finding.category,
    title: finding.title,
    file: finding.file,
    start_line: finding.start_line,
    end_line: finding.end_line,
    rationale: finding.rationale,
    suggestion: finding.suggestion ?? null,
    confidence: finding.confidence,
  };
}

export interface ReviewResult {
  review_id: string;
  agent_id: string | null;
  agent_name: string | null;
  verdict: string | null;
  summary: string | null;
  score: number | null;
  model: string | null;
  created_at: string;
  findings: FindingSummary[];
}

export function toReviewResult(review: ReviewRecord): ReviewResult {
  return {
    review_id: review.id,
    agent_id: review.agent_id,
    agent_name: review.agent_name ?? null,
    verdict: review.verdict,
    summary: review.summary,
    score: review.score,
    model: review.model,
    created_at: review.created_at,
    findings: review.findings.map(toFindingSummary),
  };
}
