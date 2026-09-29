/** Limits and exclusions for project-context markdown discovery/reads (SPEC-01). */

/** Max `.md` files returned by `listMarkdown` before `truncated` is set. */
export const MAX_LIST_FILES = 500;
/** Max paths accepted in one attach/preview request. */
export const MAX_ATTACH_PATHS = 50;
/** Per-document read cap in bytes; larger docs are skipped, never truncated. */
export const MAX_DOC_BYTES = 200 * 1024;
/** Total injected project-context token budget. */
export const MAX_CONTEXT_TOKENS = 30_000;

/** Directory names never descended into when listing markdown. */
export const EXCLUDED_DIRS: ReadonlySet<string> = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  'coverage',
  'vendor',
  '.devdigest',
]);
