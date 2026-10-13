import type { CiFailOn, Finding } from '@devdigest/shared';
import { CiResultArtifact } from '@devdigest/shared';
import { countBlockers, type ReviewOutcome } from '@devdigest/reviewer-core';

/**
 * Build the `devdigest-result.json` artifact (AC-12) from a completed review.
 * Counts are derived from the GROUNDED findings (same set `toReviewPayload`
 * posts), never the model's raw pre-grounding output.
 */
export function buildResultArtifact(opts: {
  outcome: ReviewOutcome;
  agentName: string;
  prNumber: number | null;
  /** Fix B (AC-17): wall-clock duration of the review run, measured by the caller — null when unavailable. */
  durationMs?: number | null;
}): CiResultArtifact {
  const findings = opts.outcome.review.findings;
  const counts = severityCounts(findings);
  return CiResultArtifact.parse({
    findings_count: findings.length,
    critical: counts.CRITICAL,
    warning: counts.WARNING,
    suggestion: counts.SUGGESTION,
    cost_usd: opts.outcome.costUsd,
    duration_ms: opts.durationMs ?? null,
    agent: opts.agentName,
    pr_number: opts.prNumber,
  });
}

function severityCounts(findings: Finding[]): Record<'CRITICAL' | 'WARNING' | 'SUGGESTION', number> {
  const c = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) c[f.severity] = (c[f.severity] ?? 0) + 1;
  return c;
}

/** AC-14: non-zero exit iff the agent's ci_fail_on gate is tripped. Reuses the SAME `countBlockers` the local run-executor uses — never a local reimplementation. */
export function exitCodeFor(findings: Finding[], failOn: CiFailOn): number {
  return countBlockers(findings, failOn) > 0 ? 1 : 0;
}

/**
 * AC-10 defense-in-depth: strip the literal secret value out of any string
 * before it is logged or written to a file (a thrown HTTP error, for example,
 * could otherwise echo a request header verbatim). `agent-runner` never reads
 * `OPENROUTER_API_KEY` itself outside the one place it's handed to the LLM
 * provider constructor — this only guards output.
 */
export function redactSecret(text: string, secret: string | undefined): string {
  if (!secret) return text;
  return text.split(secret).join('***REDACTED***');
}
