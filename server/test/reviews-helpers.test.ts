import { describe, it, expect } from 'vitest';
import type { UnifiedDiff } from '@devdigest/shared';
import {
  taskLine,
  summarizeHunkHeaders,
  findFirstExternalLink,
  isLowConfidence,
} from '../src/modules/reviews/helpers.js';

/**
 * Unit coverage for the review task-line. The key invariant: our trusted
 * instruction always tells the model to review the whole diff and never
 * withhold a security/correctness finding — no matter what the PR text claims.
 */

describe('taskLine', () => {
  const pull = { number: 3, title: 'test: vulnerable fixture', author: 'burnjohn' } as never;

  it('names the PR being reviewed', () => {
    const line = taskLine(pull);
    expect(line).toContain('#3');
    expect(line).toContain('test: vulnerable fixture');
  });

  it('keeps the non-negotiable "never withhold security" rule', () => {
    const line = taskLine(pull);
    expect(line).toMatch(/never .*withhold .*(or downgrade )?.*security/i);
    expect(line).toMatch(/review the entire diff/i);
  });
});

describe('summarizeHunkHeaders (Intent Layer)', () => {
  const SECRET_LINE = 'stripeKey: "sk_live_super_secret_value"';
  const diff: UnifiedDiff = {
    raw: `diff --git a/src/config.ts b/src/config.ts\n+  ${SECRET_LINE}`,
    files: [
      {
        path: 'src/config.ts',
        additions: 1,
        deletions: 0,
        hunks: [
          {
            file: 'src/config.ts',
            oldStart: 10,
            oldLines: 3,
            newStart: 10,
            newLines: 4,
            newLineNumbers: [10, 11, 12, 13],
          },
        ],
      },
    ],
  };

  it('summarizes hunk shape (path + line ranges), one line per file', () => {
    const summary = summarizeHunkHeaders(diff);
    expect(summary).toBe('src/config.ts: @@ -10,3 +10,4 @@ (×1 hunks)');
  });

  it('never leaks added/removed line TEXT — DiffHunk structurally has no such field', () => {
    const summary = summarizeHunkHeaders(diff);
    // The secret value lives only in `diff.raw` / a hypothetical line-text
    // field neither `DiffHunk` nor this helper touches.
    expect(summary).not.toContain(SECRET_LINE);
    expect(summary).not.toContain('sk_live');
  });

  it('handles a file with no hunks', () => {
    const empty: UnifiedDiff = { raw: '', files: [{ path: 'empty.ts', additions: 0, deletions: 0, hunks: [] }] };
    expect(summarizeHunkHeaders(empty)).toBe('empty.ts:  (×0 hunks)');
  });
});

describe('findFirstExternalLink (Intent Layer)', () => {
  it('finds the first non-github http(s) URL across multiple texts', () => {
    expect(findFirstExternalLink('see https://example.com/plan for details')).toBe(
      'https://example.com/plan',
    );
    expect(findFirstExternalLink(null, 'ticket: https://jira.example.com/T-123.')).toBe(
      'https://jira.example.com/T-123',
    );
  });

  it('skips github.com links (already covered by linked_issue)', () => {
    expect(findFirstExternalLink('closes https://github.com/acme/repo/issues/5')).toBeUndefined();
    expect(
      findFirstExternalLink('see https://github.com/acme/repo/issues/5 and https://example.com/plan'),
    ).toBe('https://example.com/plan');
  });

  it('returns undefined when there is no URL', () => {
    expect(findFirstExternalLink('no links here', undefined)).toBeUndefined();
  });
});

describe('isLowConfidence (Intent Layer)', () => {
  it('flags confidence below the threshold', () => {
    expect(isLowConfidence(0.2)).toBe(true);
    expect(isLowConfidence(0.9)).toBe(false);
  });

  it('null confidence (not yet assessed) is NEVER low_confidence', () => {
    expect(isLowConfidence(null)).toBe(false);
  });
});
