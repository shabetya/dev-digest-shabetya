import { describe, it, expect } from 'vitest';
import type { Finding } from '@devdigest/shared';
import { applyIntentScope } from '../src/output/intent-scope.js';

/**
 * Unit coverage for the intent-scope gate (Intent Layer's post-grounding
 * filter). Three cases per the plan's test matrix: in-scope passthrough,
 * non-CRITICAL out-of-scope dropped, multiple CRITICAL out-of-scope collapsed
 * into exactly one synthetic finding (never silently dropped).
 */
function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'f1',
    severity: 'WARNING',
    category: 'bug',
    title: 't',
    file: 'src/x.ts',
    start_line: 1,
    end_line: 1,
    rationale: 'r',
    confidence: 0.8,
    ...overrides,
  } as Finding;
}

describe('applyIntentScope', () => {
  it('is a no-op passthrough when no intent was supplied (hasIntent=false)', () => {
    const findings = [finding({ in_scope: false, severity: 'CRITICAL' })];
    const result = applyIntentScope(findings, false);
    expect(result.kept).toEqual(findings);
    expect(result.outOfScope).toHaveLength(0);
  });

  it('keeps findings that are in scope, or have no scope opinion (null/undefined never means out)', () => {
    const inScope = finding({ id: 'a', in_scope: true });
    const noOpinionUndefined = finding({ id: 'b' });
    const noOpinionNull = finding({ id: 'c', in_scope: null });
    const result = applyIntentScope([inScope, noOpinionUndefined, noOpinionNull], true);
    expect(result.kept.map((f) => f.id)).toEqual(['a', 'b', 'c']);
    expect(result.outOfScope).toHaveLength(0);
  });

  it('drops a non-CRITICAL out-of-scope finding', () => {
    const outOfScope = finding({ id: 'a', severity: 'WARNING', in_scope: false });
    const kept = finding({ id: 'b', in_scope: true });
    const result = applyIntentScope([outOfScope, kept], true);
    expect(result.kept.map((f) => f.id)).toEqual(['b']);
    expect(result.outOfScope).toHaveLength(1);
    expect(result.outOfScope[0]!.finding.id).toBe('a');
  });

  it('collapses multiple CRITICAL out-of-scope findings into exactly one synthetic finding, never dropping them', () => {
    const crit1 = finding({
      id: 'c1',
      severity: 'CRITICAL',
      in_scope: false,
      title: 'SQL injection in unrelated admin panel',
      file: 'src/admin.ts',
      start_line: 42,
      end_line: 42,
    });
    const crit2 = finding({
      id: 'c2',
      severity: 'CRITICAL',
      in_scope: false,
      title: 'Hardcoded secret in unrelated module',
      file: 'src/legacy.ts',
      start_line: 7,
      end_line: 7,
    });
    const inScopeWarning = finding({ id: 'w1', severity: 'WARNING', in_scope: true });

    const result = applyIntentScope([crit1, crit2, inScopeWarning], true);

    // The in-scope finding passes through untouched, and exactly ONE
    // synthetic CRITICAL finding replaces the two collapsed ones.
    expect(result.kept).toHaveLength(2);
    const synthetic = result.kept.find((f) => f.id !== 'w1')!;
    expect(synthetic.severity).toBe('CRITICAL');
    expect(synthetic.title).toBe('2 out-of-scope critical issue(s) detected');
    expect(synthetic.rationale).toContain('SQL injection in unrelated admin panel');
    expect(synthetic.rationale).toContain('src/admin.ts:42');
    expect(synthetic.rationale).toContain('Hardcoded secret in unrelated module');
    expect(synthetic.rationale).toContain('src/legacy.ts:7');
    // Grounding-compatible location, taken from the first collapsed finding.
    expect(synthetic.file).toBe('src/admin.ts');
    expect(synthetic.start_line).toBe(42);
    // Both originals are recorded as out-of-scope (collapsed, not dropped).
    expect(result.outOfScope.map((d) => d.finding.id).sort()).toEqual(['c1', 'c2']);
  });
});
