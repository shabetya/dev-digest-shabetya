import type { SpecFileReason } from '@devdigest/shared';
import { ROOT_GROUP } from './constants.js';

/** Top-level folder name of a repo-relative path; `other` for root-level files. */
export function groupOf(path: string): string {
  const i = path.indexOf('/');
  return i === -1 ? ROOT_GROUP : path.slice(0, i);
}

/** Classify a `readMarkdown` failure into a list-row reason. */
export function readFailureReason(err: unknown): SpecFileReason {
  return /too large/i.test((err as Error)?.message ?? '') ? 'too_large' : 'unreadable';
}

/** True when the error is a missing file/dir (ENOENT). */
export function isNotFound(err: unknown): boolean {
  return (err as NodeJS.ErrnoException)?.code === 'ENOENT' || /^ENOENT/.test((err as Error)?.message ?? '');
}

/** Keep the first occurrence of each path, preserving order. */
export function dedupePaths(paths: readonly string[]): string[] {
  return [...new Set(paths)];
}
