import { describe, it, expect } from 'vitest';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import {
  buildMissing,
  describeMissingInputs,
  formatFileInputs,
  hunkRangesByFile,
  isEmptyBrief,
  normalizePath,
  snapLine,
  validateBrief,
  type BriefFileInput,
} from './helpers.js';
import type { BriefLlmResponse } from './types.js';

const PATCH = (path: string, hunk: string) =>
  `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n${hunk}\n+x\n`;

describe('hunkRangesByFile', () => {
  it('uses right-side ranges and skips deleted files', () => {
    const diff = parseUnifiedDiff(
      PATCH('a.ts', '@@ -1,2 +10,3 @@') +
        PATCH('gone.ts', '@@ -1,4 +0,0 @@') +
        PATCH('b.ts', '@@ -5,2 +4,0 @@'),
    );
    const m = hunkRangesByFile(diff);
    expect(m.get('a.ts')).toEqual([[10, 12]]);
    expect(m.has('gone.ts')).toBe(false);
    expect(m.get('b.ts')).toEqual([[4, 4]]);
  });
});

describe('normalizePath / snapLine', () => {
  const paths = ['src/A.ts', 'src/b.ts', 'docs/x$y.md'];
  it('normalizes prefix and case, drops unknown or ambiguous', () => {
    expect(normalizePath('./src/A.ts', paths)).toBe('src/A.ts');
    expect(normalizePath('SRC/B.TS', paths)).toBe('src/b.ts');
    expect(normalizePath('nope.ts', paths)).toBeNull();
    expect(normalizePath('SRC/a.ts', ['src/a.ts', 'Src/a.ts'])).toBeNull();
    expect(normalizePath('docs/x_y.md', paths)).toBe('docs/x$y.md');
  });
  it('snaps to the nearest hunk start', () => {
    const r = [[10, 20], [50, 60]] as const;
    expect(snapLine(15, r)).toBe(15);
    expect(snapLine(30, r)).toBe(10);
    expect(snapLine(45, r)).toBe(50);
    expect(snapLine(5, [])).toBeNull();
  });
});

describe('validateBrief', () => {
  const paths = ['a.ts', 'b.ts', 'bin.png'];
  const ranges = new Map([
    ['a.ts', [[10, 20]] as const],
    ['b.ts', [[1, 5]] as const],
  ]);
  const draft: BriefLlmResponse = {
    summary: '  Does a thing.  ',
    risks: [
      { title: 'Real', explanation: 'e', severity: 'high', file_refs: ['a.ts', 'ghost.ts'] },
      { title: 'PR-wide', explanation: null, severity: 'low', file_refs: ['ghost.ts'] },
      { title: '   ', explanation: 'blank title', severity: 'low', file_refs: [] },
    ],
    review_focus: [
      { file: 'a.ts', line: 500, reason: 'r1' },
      { file: 'a.ts', line: 10, reason: 'dup after snap' },
      { file: 'ghost.ts', line: 1, reason: 'unknown' },
      { file: 'bin.png', line: 1, reason: 'no hunks' },
      { file: 'b.ts', line: 3, reason: 'ok' },
    ],
  };
  it('drops bad refs, keeps ref-less risk, snaps and dedupes focus', () => {
    const v = validateBrief(draft, paths, ranges);
    expect(v.summary).toBe('Does a thing.');
    expect(v.risks.map((r) => [r.title, r.file_refs])).toEqual([
      ['Real', ['a.ts']],
      ['PR-wide', []],
    ]);
    expect(v.review_focus).toEqual([
      { file: 'a.ts', line: 10, reason: 'r1' },
      { file: 'b.ts', line: 3, reason: 'ok' },
    ]);
  });
  it('caps counts and string lengths', () => {
    const many: BriefLlmResponse = {
      summary: 's'.repeat(5000),
      risks: Array.from({ length: 20 }, (_, i) => ({
        title: `t${i}`.padEnd(500, 'x'),
        explanation: 'e'.repeat(5000),
        severity: 'medium' as const,
        file_refs: [],
      })),
      review_focus: Array.from({ length: 12 }, (_, i) => ({ file: 'a.ts', line: 10 + i, reason: 'r' })),
    };
    const v = validateBrief(many, paths, ranges);
    expect(v.risks).toHaveLength(8);
    expect(v.review_focus).toHaveLength(5);
    expect(v.summary.length).toBeLessThanOrEqual(1200);
    expect(v.risks[0]!.title.length).toBeLessThanOrEqual(200);
    expect(v.risks[0]!.explanation.length).toBeLessThanOrEqual(800);
  });
  it('isEmptyBrief only when all three are empty', () => {
    expect(isEmptyBrief({ summary: '', risks: [], review_focus: [] })).toBe(true);
    expect(isEmptyBrief({ summary: 'x', risks: [], review_focus: [] })).toBe(false);
  });
});

describe('formatFileInputs / missing', () => {
  const mk = (path: string, role: BriefFileInput['role'], churn: number): BriefFileInput => ({
    path,
    additions: churn,
    deletions: 0,
    role,
    ranges: churn > 0 ? [[1, 3]] : [],
  });
  it('sorts by role then churn, omits overflow, sanitizes paths', () => {
    const out = formatFileInputs(
      [mk('lock.json', 'boilerplate', 900), mk('t.test.ts', 'tests', 5), mk('c<x>.ts', 'core', 1), mk('d.ts', 'core', 9)],
      3,
    );
    const lines = out.split('\n');
    expect(lines[0]).toContain('d.ts');
    expect(lines[1]).toContain('c_x_.ts');
    expect(lines[2]).toContain('t.test.ts');
    expect(lines[3]).toBe('(1 more files omitted)');
    expect(lines[0]).toContain('hunks: 1-3');
  });
  it('builds missing[] in stable order and the prompt line', () => {
    expect(buildMissing({ intent: false, blast: true, specs: false })).toEqual(['intent', 'specs']);
    expect(describeMissingInputs([])).toBe('Absent inputs: none.');
    expect(describeMissingInputs(['blast'])).toContain('blast');
  });
});
