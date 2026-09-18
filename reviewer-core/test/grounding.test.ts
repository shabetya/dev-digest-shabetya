import { describe, it, expect } from 'vitest';
import type { Finding, UnifiedDiff } from '@devdigest/shared';
import { buildLineIndex, groundFindings, groundingSummary } from '../src/grounding.js';

/**
 * Direct unit coverage for the citation-grounding gate's building blocks
 * (previously only exercised indirectly through run.test.ts's end-to-end
 * cases). `buildLineIndex` + the range-intersection check inside
 * `groundFindings` implement the "mandatory mechanical gate" the whole
 * package's grounding guarantee leans on.
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
    ...overrides,
  } as Finding;
}

function diffWithHunks(
  file: string,
  hunks: { newStart: number; newLines: number; newLineNumbers?: number[] }[],
): UnifiedDiff {
  return {
    raw: '',
    files: [
      {
        path: file,
        additions: 0,
        deletions: 0,
        hunks: hunks.map((h) => ({
          file,
          oldStart: h.newStart,
          oldLines: 0,
          newStart: h.newStart,
          newLines: h.newLines,
          newLineNumbers: h.newLineNumbers ?? [],
        })),
      },
    ],
  } as UnifiedDiff;
}

describe('buildLineIndex', () => {
  it('uses newLineNumbers when present', () => {
    const diff = diffWithHunks('a.ts', [{ newStart: 10, newLines: 2, newLineNumbers: [10, 12] }]);
    const idx = buildLineIndex(diff);
    expect([...idx.get('a.ts')!]).toEqual([10, 12]);
  });

  it('falls back to the declared new range when newLineNumbers is empty', () => {
    const diff = diffWithHunks('a.ts', [{ newStart: 5, newLines: 3 }]);
    const idx = buildLineIndex(diff);
    expect([...idx.get('a.ts')!].sort((a, b) => a - b)).toEqual([5, 6, 7]);
  });

  it('indexes every file present in the diff, even with no hunks', () => {
    const diff: UnifiedDiff = {
      raw: '',
      files: [{ path: 'empty.ts', additions: 0, deletions: 0, hunks: [] }],
    };
    const idx = buildLineIndex(diff);
    expect(idx.get('empty.ts')).toEqual(new Set());
  });
});

describe('groundFindings — range intersection against real diff hunks', () => {
  const diff = diffWithHunks('src/x.ts', [{ newStart: 10, newLines: 3, newLineNumbers: [10, 11, 12] }]);

  it('keeps a finding whose range is fully inside a hunk', () => {
    const result = groundFindings([finding({ start_line: 11, end_line: 11 })], diff);
    expect(result.kept).toHaveLength(1);
    expect(result.dropped).toHaveLength(0);
    expect(groundingSummary(result)).toBe('1/1 passed');
  });

  it('drops a finding whose range does not intersect any hunk', () => {
    const result = groundFindings([finding({ start_line: 999, end_line: 999 })], diff);
    expect(result.kept).toHaveLength(0);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0]!.reason).toMatch(/do not intersect/);
  });

  it('boundary: a range ending exactly on the last hunk line is kept', () => {
    // range 9-10: only line 10 is in the hunk, but that's enough to intersect.
    const result = groundFindings([finding({ start_line: 9, end_line: 10 })], diff);
    expect(result.kept).toHaveLength(1);
  });

  it('boundary: a range starting one line past the hunk is dropped', () => {
    // hunk covers 10-12; range 13-13 is immediately outside it.
    const result = groundFindings([finding({ start_line: 13, end_line: 13 })], diff);
    expect(result.kept).toHaveLength(0);
    expect(result.dropped).toHaveLength(1);
  });

  it('drops a finding whose file is not present in the diff at all', () => {
    const result = groundFindings([finding({ file: 'other.ts' })], diff);
    expect(result.dropped[0]!.reason).toMatch(/not present in diff/);
  });

  it('full-file kinds (e.g. secret_leak) only require the file to be present, not a line match', () => {
    const result = groundFindings(
      [finding({ start_line: 999, end_line: 999, kind: 'secret_leak' })],
      diff,
    );
    expect(result.kept).toHaveLength(1);
  });
});
