import { ValidationError } from '../../platform/errors.js';
import { InvalidMarkdownPathError, assertMarkdownPaths } from '../../adapters/git/markdown-path.js';

/**
 * Validate an attachment path list (each `.md`, relative, no `..`, no
 * duplicates, max 50) and map guard failures to a 422. Existence not required.
 * Shared by the agents and skills attach endpoints.
 */
export function validateAttachPaths(paths: string[]): void {
  try {
    assertMarkdownPaths(paths);
  } catch (err) {
    if (err instanceof InvalidMarkdownPathError) throw new ValidationError(err.message);
    throw err;
  }
}
