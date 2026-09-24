import type { SmartDiffRole } from '@devdigest/shared';

/**
 * Smart Diff path→role classification patterns.
 *
 * `classifyFile` (./classify.ts) checks these in `CLASSIFY_ORDER` — FIRST
 * MATCH WINS. Order is significant: several patterns deliberately overlap
 * (a snapshot inside `__tests__/`, a `.md` inside `.claude/`, a `README.md`
 * inside `e2e/`) — see `smart-diff-classify.test.ts` for the pinned cases.
 * `core` is the fallback when nothing above matches; it has no pattern list.
 *
 * A pattern with no `/` matches the file's BASENAME anywhere in the tree
 * (gitignore-style, e.g. `*.lock` matches `server/pnpm-lock.yaml` too). A
 * pattern containing `/` matches the FULL relative path, where a double-star
 * segment crosses directory boundaries and a LEADING double-star segment
 * additionally matches zero directories (so a markdown-anywhere pattern also
 * matches a root-level `README.md`, not just a nested one).
 */
export const CLASSIFY_PATTERNS: Record<Exclude<SmartDiffRole, 'core'>, string[]> = {
  boilerplate: [
    '*.lock',
    'pnpm-lock.yaml',
    'package-lock.json',
    'yarn.lock',
    'dist/**',
    'build/**',
    '**/__snapshots__/**',
    '*.snap',
    '*.generated.*',
    '*.min.js',
  ],
  tests: [
    '**/*.test.ts',
    '**/*.test.tsx',
    '**/*.it.test.ts',
    '**/*.spec.ts',
    '**/test/**',
    '**/tests/**',
    '**/__tests__/**',
    'e2e/**',
  ],
  wiring: [
    'index.ts',
    'index.js',
    '*.config.*',
    'tsconfig*.json',
    '.eslintrc*',
    '.env*',
    'docker-compose*.yml',
    '.github/**',
    '.claude/**',
  ],
  docs: ['**/*.md', 'docs/**', 'README*', 'CHANGELOG*', 'LICENSE'],
};

/** Fixed check order for `classifyFile` — first match wins; `core` is the
 *  implicit fallback when none of these match. */
export const CLASSIFY_ORDER: Exclude<SmartDiffRole, 'core'>[] = [
  'boilerplate',
  'tests',
  'wiring',
  'docs',
];
