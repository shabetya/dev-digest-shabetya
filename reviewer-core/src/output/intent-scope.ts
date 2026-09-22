import type { Finding } from '@devdigest/shared';

/**
 * Intent-scope gate (Intent Layer) — the second, optional post-grounding
 * step. Only meaningful when the run supplied an `Intent` (the agent was then
 * asked to set each finding's `in_scope`); when no intent was supplied this
 * is a no-op passthrough.
 *
 * Policy, deliberately asymmetric by severity:
 *  - `in_scope === true` or `undefined`/`null` (no opinion) → always kept.
 *    `null`/`undefined` NEVER means "out of scope" — only an explicit `false`
 *    does.
 *  - `in_scope === false` + non-CRITICAL → dropped (out-of-scope noise the
 *    reviewer explicitly flagged as outside the PR's stated purpose).
 *  - `in_scope === false` + CRITICAL → NEVER silently dropped (scope must
 *    never suppress a real defect). Every such finding is collapsed into
 *    exactly ONE synthetic CRITICAL finding so a scope-creep PR still shows
 *    one unmissable signal instead of N noisy, "off-topic-looking" criticals.
 */
export interface IntentScopeResult {
  kept: Finding[];
  outOfScope: { finding: Finding; reason: string }[];
}

const COLLAPSED_KIND: Finding['kind'] = 'finding';

function collapseCritical(findings: Finding[]): Finding {
  const first = findings[0]!;
  const bullets = findings
    .map((f) => `- ${f.title} (\`${f.file}:${f.start_line}\`)`)
    .join('\n');
  return {
    id: `intent-scope-collapsed:${first.id}`,
    severity: 'CRITICAL',
    category: first.category,
    title: `${findings.length} out-of-scope critical issue(s) detected`,
    file: first.file,
    start_line: first.start_line,
    end_line: first.end_line,
    rationale:
      `The reviewing agent flagged ${findings.length} CRITICAL finding(s) as outside this ` +
      `PR's stated scope. Scope never suppresses a real defect, so they are surfaced here ` +
      `as one collapsed signal instead of being dropped:\n\n${bullets}`,
    suggestion: null,
    confidence: Math.max(...findings.map((f) => f.confidence)),
    kind: COLLAPSED_KIND,
    trifecta_components: null,
    evidence: null,
    in_scope: false,
  };
}

export function applyIntentScope(findings: Finding[], hasIntent: boolean): IntentScopeResult {
  if (!hasIntent) return { kept: findings, outOfScope: [] };

  const kept: Finding[] = [];
  const outOfScope: { finding: Finding; reason: string }[] = [];
  const criticalOutOfScope: Finding[] = [];

  for (const finding of findings) {
    if (finding.in_scope !== false) {
      kept.push(finding);
      continue;
    }
    if (finding.severity === 'CRITICAL') {
      criticalOutOfScope.push(finding);
      outOfScope.push({ finding, reason: 'out of scope (CRITICAL — collapsed, not dropped)' });
    } else {
      outOfScope.push({ finding, reason: 'out of scope (dropped)' });
    }
  }

  if (criticalOutOfScope.length > 0) {
    kept.push(collapseCritical(criticalOutOfScope));
  }

  return { kept, outOfScope };
}
