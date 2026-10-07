import { describe, it, expect } from 'vitest';
import {
  aggregate,
  lineRange,
  matchOneToOne,
  matches,
  normalizePath,
  scoreCase,
} from '../src/modules/eval/scoring.js';

const f = (file: string, s: number, e = s) => ({ file, start_line: s, end_line: e });

describe('eval scoring: matching (AC-17)', () => {
  it('normalizes a leading ./ and requires an exact path', () => {
    expect(normalizePath('./src/a.ts')).toBe('src/a.ts');
    expect(matches({ file: './src/a.ts', start_line: 3 }, f('src/a.ts', 3))).toBe(true);
    expect(matches({ file: 'src/a.ts', start_line: 3 }, f('src/b.ts', 3))).toBe(false);
    expect(matches({ file: 'a.ts', start_line: 3 }, f('x/a.ts', 3))).toBe(false);
  });

  it('uses inclusive overlap; touching ends match, adjacent ranges do not', () => {
    const e = { file: 'a.ts', start_line: 10, end_line: 12 };
    expect(matches(e, f('a.ts', 12, 15))).toBe(true);
    expect(matches(e, f('a.ts', 5, 10))).toBe(true);
    expect(matches(e, f('a.ts', 13, 14))).toBe(false);
    expect(matches(e, f('a.ts', 8, 9))).toBe(false);
    expect(matches(e, f('a.ts', 11))).toBe(true);
  });

  it('tolerates swapped bounds and a missing end_line', () => {
    expect(lineRange(9, 4)).toEqual([4, 9]);
    expect(lineRange(7, undefined)).toEqual([7, 7]);
    expect(lineRange(7, null)).toEqual([7, 7]);
    expect(matches({ file: 'a.ts', start_line: 9, end_line: 4 }, f('a.ts', 5))).toBe(true);
    expect(matches({ file: 'a.ts', start_line: 6 }, f('a.ts', 6, 6))).toBe(true);
    expect(matches({ file: 'a.ts', start_line: 6 }, f('a.ts', 7, 8))).toBe(false);
  });
});

describe('eval scoring: one-to-one matching (AC-18)', () => {
  it('lets a finding satisfy at most one expectation', () => {
    const expected = [
      { file: 'a.ts', start_line: 10, end_line: 20 },
      { file: 'a.ts', start_line: 12, end_line: 14 },
    ];
    const pairs = matchOneToOne(expected, [f('a.ts', 12, 13)]);
    expect(pairs).toHaveLength(1);
    const s = scoreCase({ expectation: 'must_find', expected, findings: [f('a.ts', 12, 13)], preGroundingCount: 1 });
    expect(s.pass).toBe(false);
    expect(s.matched).toBe(1);
  });

  it('prefers the lowest line distance, with a stable order tie-break', () => {
    const expected = [{ file: 'a.ts', start_line: 10, end_line: 12 }];
    const findings = [f('a.ts', 12, 30), f('a.ts', 10, 12), f('a.ts', 11, 12)];
    expect(matchOneToOne(expected, findings)).toEqual([{ expectationIndex: 0, findingIndex: 1 }]);
    // exact tie -> earlier finding wins
    const tie = matchOneToOne(expected, [f('a.ts', 10, 12), f('a.ts', 10, 12)]);
    expect(tie).toEqual([{ expectationIndex: 0, findingIndex: 0 }]);
  });

  it('is deterministic for fixed input', () => {
    const expected = [
      { file: 'a.ts', start_line: 1, end_line: 5 },
      { file: 'a.ts', start_line: 3, end_line: 8 },
    ];
    const findings = [f('a.ts', 4, 4), f('a.ts', 2, 6)];
    expect(matchOneToOne(expected, findings)).toEqual(matchOneToOne(expected, findings));
  });
});

describe('eval scoring: per-case pass rules', () => {
  it('must_find passes iff every expectation is matched', () => {
    const expected = [
      { file: 'a.ts', start_line: 1 },
      { file: 'b.ts', start_line: 5 },
    ];
    expect(
      scoreCase({ expectation: 'must_find', expected, findings: [f('a.ts', 1), f('b.ts', 5)], preGroundingCount: 2 }).pass,
    ).toBe(true);
    const miss = scoreCase({ expectation: 'must_find', expected, findings: [f('a.ts', 1)], preGroundingCount: 1 });
    expect(miss.pass).toBe(false);
    expect(miss.recall).toBe(0.5);
  });

  it('must_not_flag passes iff nothing overlaps; unrelated findings are neutral', () => {
    const expected = [{ file: 'a.ts', start_line: 10, end_line: 12 }];
    const clean = scoreCase({ expectation: 'must_not_flag', expected, findings: [f('a.ts', 40)], preGroundingCount: 1 });
    expect(clean.pass).toBe(true);
    expect(clean.noise).toBe(0);
    expect(clean.recall).toBeNull();
    const dirty = scoreCase({
      expectation: 'must_not_flag',
      expected,
      findings: [f('a.ts', 11), f('a.ts', 12), f('a.ts', 99)],
      preGroundingCount: 3,
    });
    expect(dirty.pass).toBe(false);
    expect(dirty.noise).toBe(2);
    expect(dirty.precision).toBeCloseTo(1 / 3);
  });

  it('empty expected passes iff zero grounded findings; every finding is noise', () => {
    expect(scoreCase({ expectation: 'must_not_flag', expected: [], findings: [], preGroundingCount: 0 }).pass).toBe(true);
    const s = scoreCase({ expectation: 'must_not_flag', expected: [], findings: [f('a.ts', 1), f('a.ts', 2)], preGroundingCount: 3 });
    expect(s.pass).toBe(false);
    expect(s.noise).toBe(2);
    expect(s.precision).toBe(0);
    expect(s.citationAccuracy).toBeCloseTo(2 / 3);
  });
});

describe('eval scoring: aggregates and null rules (AC-19..21)', () => {
  it('sums counters across cases', () => {
    const a = scoreCase({ expectation: 'must_find', expected: [{ file: 'a.ts', start_line: 1 }], findings: [f('a.ts', 1), f('a.ts', 50)], preGroundingCount: 3 });
    const b = scoreCase({ expectation: 'must_not_flag', expected: [{ file: 'b.ts', start_line: 1 }], findings: [f('b.ts', 1)], preGroundingCount: 1 });
    const agg = aggregate([a, b]);
    expect(agg.recall).toBe(1); // 1/1
    expect(agg.precision).toBeCloseTo(1 - 1 / 3); // 1 noise of 3 grounded
    expect(agg.citationAccuracy).toBeCloseTo(3 / 4);
  });

  it('is null when a denominator is zero', () => {
    expect(aggregate([])).toEqual({ recall: null, precision: null, citationAccuracy: null });
    const onlyNegative = scoreCase({ expectation: 'must_not_flag', expected: [], findings: [], preGroundingCount: 0 });
    expect(aggregate([onlyNegative])).toEqual({ recall: null, precision: null, citationAccuracy: null });
  });

  it('zero findings on a must_find suite: recall 0, precision and citation null', () => {
    const s = scoreCase({ expectation: 'must_find', expected: [{ file: 'a.ts', start_line: 1 }], findings: [], preGroundingCount: 0 });
    expect(aggregate([s])).toEqual({ recall: 0, precision: null, citationAccuracy: null });
  });

  it('never reports a citation ratio above 1 even with an inconsistent pre-gate count', () => {
    const s = scoreCase({ expectation: 'must_find', expected: [{ file: 'a.ts', start_line: 1 }], findings: [f('a.ts', 1)], preGroundingCount: 0 });
    expect(s.citationAccuracy).toBe(1);
  });
});
