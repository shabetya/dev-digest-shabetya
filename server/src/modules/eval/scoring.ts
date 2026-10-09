/**
 * Eval scoring — PURE code, no LLM, no clock, no I/O (SPEC-04 AC-17..22).
 *
 * A grounded finding matches an expectation iff the files are equal (after
 * normalising a leading `./`) and the inclusive line ranges overlap. Severity,
 * category and title are NOT part of matching.
 */

export type ExpectationKind = 'must_find' | 'must_not_flag';

export interface ScoredExpectation {
  file: string;
  start_line: number;
  end_line?: number | null | undefined;
}

export interface ScoredFinding {
  file: string;
  start_line: number;
  end_line: number;
}

export interface Match {
  expectationIndex: number;
  findingIndex: number;
}

/** Raw counters for one case; summed by `aggregate` (never averaged ratios). */
export interface CaseScore {
  pass: boolean;
  /** Expectations matched one-to-one (meaningful for `must_find`). */
  matched: number;
  /** Expectation count counted toward recall (0 for `must_not_flag`). */
  mustFindTotal: number;
  /** Findings that hit a forbidden range / any finding on an empty-expected case. */
  noise: number;
  /** Grounded findings the model produced. */
  groundedFindings: number;
  /** Findings the model emitted before the grounding gate. */
  emittedFindings: number;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
}

export interface Aggregate {
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
}

/** Strip any leading `./` so `./src/a.ts` equals `src/a.ts`. */
export function normalizePath(p: string): string {
  let out = p;
  while (out.startsWith('./')) out = out.slice(2);
  return out;
}

/** Inclusive `[lo, hi]`; a missing end collapses to the start, swapped bounds are tolerated. */
export function lineRange(start: number, end?: number | null): [number, number] {
  const e = end ?? start;
  return start <= e ? [start, e] : [e, start];
}

export function rangesOverlap(a: [number, number], b: [number, number]): boolean {
  return a[0] <= b[1] && b[0] <= a[1];
}

/** True iff `f` matches `e` (AC-17). */
export function matches(e: ScoredExpectation, f: ScoredFinding): boolean {
  if (normalizePath(e.file) !== normalizePath(f.file)) return false;
  return rangesOverlap(lineRange(e.start_line, e.end_line), lineRange(f.start_line, f.end_line));
}

function distance(e: ScoredExpectation, f: ScoredFinding): number {
  const [es, ee] = lineRange(e.start_line, e.end_line);
  const [fs, fe] = lineRange(f.start_line, f.end_line);
  return Math.abs(es - fs) + Math.abs(ee - fe);
}

/**
 * One-to-one matching (AC-18): every overlapping pair is a candidate; take them
 * greedily by lowest line distance, ties broken by expectation then finding
 * order, skipping pairs whose expectation or finding is already used.
 */
export function matchOneToOne(
  expected: readonly ScoredExpectation[],
  findings: readonly ScoredFinding[],
): Match[] {
  const candidates: (Match & { d: number })[] = [];
  expected.forEach((e, expectationIndex) => {
    findings.forEach((f, findingIndex) => {
      if (matches(e, f)) candidates.push({ expectationIndex, findingIndex, d: distance(e, f) });
    });
  });
  candidates.sort(
    (a, b) => a.d - b.d || a.expectationIndex - b.expectationIndex || a.findingIndex - b.findingIndex,
  );
  const usedE = new Set<number>();
  const usedF = new Set<number>();
  const out: Match[] = [];
  for (const c of candidates) {
    if (usedE.has(c.expectationIndex) || usedF.has(c.findingIndex)) continue;
    usedE.add(c.expectationIndex);
    usedF.add(c.findingIndex);
    out.push({ expectationIndex: c.expectationIndex, findingIndex: c.findingIndex });
  }
  return out;
}

function ratio(num: number, den: number): number | null {
  return den > 0 ? Math.min(1, Math.max(0, num / den)) : null;
}

/** Score one case from its stored expectation, grounded findings and pre-gate count. */
export function scoreCase(input: {
  expectation: ExpectationKind;
  expected: readonly ScoredExpectation[];
  findings: readonly ScoredFinding[];
  preGroundingCount: number;
}): CaseScore {
  const { expectation, expected, findings } = input;
  const grounded = findings.length;
  // The gate can only remove findings, so the pre-gate count is at least `grounded`.
  const emitted = Math.max(input.preGroundingCount, grounded);

  let pass: boolean;
  let matched = 0;
  let mustFindTotal = 0;
  let noise = 0;

  if (expectation === 'must_find') {
    mustFindTotal = expected.length;
    matched = matchOneToOne(expected, findings).length;
    pass = matched === expected.length;
  } else if (expected.length === 0) {
    // "Agent must stay silent on this input": every finding is noise.
    noise = grounded;
    pass = grounded === 0;
  } else {
    // Noise counts every finding that overlaps a forbidden range (AC-17
    // relation), not just one-to-one pairs: two findings on a dismissed line
    // are both noise.
    noise = findings.filter((f) => expected.some((e) => matches(e, f))).length;
    pass = noise === 0;
  }

  return {
    pass,
    matched,
    mustFindTotal,
    noise,
    groundedFindings: grounded,
    emittedFindings: emitted,
    recall: ratio(matched, mustFindTotal),
    precision: grounded > 0 ? 1 - noise / grounded : null,
    citationAccuracy: ratio(grounded, emitted),
  };
}

/**
 * Suite aggregate over non-errored cases (AC-19..21). Sums counters first, so a
 * case with many findings weighs more than one with few; null when the
 * denominator is zero.
 */
export function aggregate(cases: readonly CaseScore[]): Aggregate {
  let matched = 0;
  let mustFind = 0;
  let noise = 0;
  let grounded = 0;
  let emitted = 0;
  for (const c of cases) {
    matched += c.matched;
    mustFind += c.mustFindTotal;
    noise += c.noise;
    grounded += c.groundedFindings;
    emitted += c.emittedFindings;
  }
  return {
    recall: ratio(matched, mustFind),
    precision: grounded > 0 ? 1 - noise / grounded : null,
    citationAccuracy: ratio(grounded, emitted),
  };
}
