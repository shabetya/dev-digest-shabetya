import { isAbsolute, sep, resolve } from 'node:path';
import { MAX_ATTACH_PATHS } from './constants.js';

/** Thrown for a path that violates the markdown path guard (maps to 422 upstream). */
export class InvalidMarkdownPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMarkdownPathError';
  }
}

/** Validate a single repo-relative markdown path (no fs access). */
export function assertMarkdownPath(path: string): void {
  if (typeof path !== 'string' || path.length === 0) {
    throw new InvalidMarkdownPathError('path is empty');
  }
  if (path.includes('\0')) throw new InvalidMarkdownPathError('path contains NUL');
  if (isAbsolute(path) || path.startsWith('/') || path.startsWith('\\') || /^[a-zA-Z]:/.test(path)) {
    throw new InvalidMarkdownPathError(`absolute path not allowed: ${path}`);
  }
  if (path.split(/[\\/]+/).includes('..')) {
    throw new InvalidMarkdownPathError(`path traversal not allowed: ${path}`);
  }
  if (!path.toLowerCase().endsWith('.md')) {
    throw new InvalidMarkdownPathError(`only .md files allowed: ${path}`);
  }
}

/** Validate a list of paths: each valid, no duplicates, at most MAX_ATTACH_PATHS. */
export function assertMarkdownPaths(paths: readonly string[]): void {
  if (paths.length > MAX_ATTACH_PATHS) {
    throw new InvalidMarkdownPathError(`too many paths (max ${MAX_ATTACH_PATHS})`);
  }
  const seen = new Set<string>();
  for (const p of paths) {
    assertMarkdownPath(p);
    if (seen.has(p)) throw new InvalidMarkdownPathError(`duplicate path: ${p}`);
    seen.add(p);
  }
}

/** True when `child` (already realpath'd) is inside `root` (already realpath'd). */
export function isInside(root: string, child: string): boolean {
  const r = resolve(root);
  const c = resolve(child);
  return c === r || c.startsWith(r.endsWith(sep) ? r : r + sep);
}
