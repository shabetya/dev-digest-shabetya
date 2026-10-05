import { readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { isInside } from './markdown-path.js';

/**
 * Traversal-safe read access to a repo clone, for any file type (the markdown
 * guard in `markdown-path.ts` only admits `.md`). Every path is treated as
 * untrusted: it must be repo-relative, free of `..`/NUL, and its realpath
 * (symlinks resolved) must stay inside the realpath of the clone root and be
 * a regular file.
 */

/** Per-file read cap in bytes; larger files are skipped, never truncated. */
export const MAX_REPO_FILE_BYTES = 256 * 1024;

/** Pure lexical check (no fs): repo-relative, no traversal, no NUL. */
export function isSafeRelativePath(path: unknown): path is string {
  if (typeof path !== 'string' || path.length === 0 || path.length > 500) return false;
  if (path.includes('\0')) return false;
  if (isAbsolute(path) || path.startsWith('/') || path.startsWith('\\') || /^[a-zA-Z]:/.test(path)) {
    return false;
  }
  if (path.split(/[\\/]+/).includes('..')) return false;
  return true;
}

/** Read-only view of a clone. All methods resolve to false/null instead of throwing. */
export interface RepoFiles {
  /** True when `path` is a regular file whose realpath is inside the clone. */
  exists(path: string): Promise<boolean>;
  /** True when `path` is a file OR directory whose realpath is inside the clone (not the root itself). */
  pathExists(path: string): Promise<boolean>;
  /** File text, or null when missing/unsafe/not a file/over `maxBytes`. */
  read(path: string, maxBytes?: number): Promise<string | null>;
}

export async function createRepoFiles(cloneRoot: string): Promise<RepoFiles | null> {
  let root: string;
  try {
    root = await realpath(cloneRoot);
  } catch {
    return null;
  }

  async function resolveSafe(path: string, allowDir = false): Promise<string | null> {
    if (!isSafeRelativePath(path)) return null;
    try {
      const real = await realpath(join(root, path));
      if (!isInside(root, real) || real === root) return null;
      const s = await stat(real);
      return s.isFile() || (allowDir && s.isDirectory()) ? real : null;
    } catch {
      return null;
    }
  }

  return {
    async exists(path) {
      return (await resolveSafe(path)) !== null;
    },
    async pathExists(path) {
      return (await resolveSafe(path, true)) !== null;
    },
    async read(path, maxBytes = MAX_REPO_FILE_BYTES) {
      const real = await resolveSafe(path);
      if (!real) return null;
      try {
        if ((await stat(real)).size > maxBytes) return null;
        return await readFile(real, 'utf8');
      } catch {
        return null;
      }
    },
  };
}
