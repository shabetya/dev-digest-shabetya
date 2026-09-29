import type { SpecFile, SpecFileList, SpecPreview } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { InvalidMarkdownPathError } from '../../adapters/git/markdown-path.js';
import { MAX_DOC_BYTES } from '../../adapters/git/constants.js';
import type { ContextRepository } from './repository.js';
import { LIST_READ_CONCURRENCY } from './constants.js';
import { groupOf, isNotFound, readFailureReason } from './helpers.js';

/**
 * Project-context service: lists/previews repo markdown docs from the on-disk
 * clone (tokens computed live, never persisted) and validates attachment
 * paths. Docs are read-only — there is no write path for doc content.
 */
export class ContextService {
  constructor(
    private container: Container,
    private repo: ContextRepository,
  ) {}

  private async resolveRepo(workspaceId: string, repoId: string) {
    const row = await this.repo.getRepo(workspaceId, repoId);
    if (!row) throw new NotFoundError('Repo not found');
    return row;
  }

  async list(workspaceId: string, repoId: string): Promise<SpecFileList> {
    const row = await this.resolveRepo(workspaceId, repoId);
    const noClone: SpecFileList = { files: [], truncated: false, reason: 'no_clone' };
    if (!row.clonePath) return noClone;
    const ref = { owner: row.owner, name: row.name };

    let listing: { paths: string[]; truncated: boolean };
    try {
      listing = await this.container.git.listMarkdown(ref);
    } catch (err) {
      if (isNotFound(err)) return noClone;
      throw err;
    }
    const usedBy = await this.repo.usedByCounts(workspaceId);

    const files: SpecFile[] = [];
    for (let i = 0; i < listing.paths.length; i += LIST_READ_CONCURRENCY) {
      const batch = listing.paths.slice(i, i + LIST_READ_CONCURRENCY);
      files.push(...(await Promise.all(batch.map((p) => this.describe(ref, p, usedBy)))));
    }
    return { files, truncated: listing.truncated };
  }

  private async describe(
    ref: { owner: string; name: string },
    path: string,
    usedBy: Map<string, number>,
  ): Promise<SpecFile> {
    const base = { path, group: groupOf(path), used_by_agents: usedBy.get(path) ?? 0 };
    try {
      const content = await this.container.git.readMarkdown(ref, path, MAX_DOC_BYTES);
      if (content.trim().length === 0) {
        return { ...base, size: Buffer.byteLength(content), tokens: 0, reason: 'empty' };
      }
      return {
        ...base,
        size: Buffer.byteLength(content),
        tokens: this.container.tokenizer.count(content),
      };
    } catch (err) {
      return { ...base, tokens: 0, reason: readFailureReason(err) };
    }
  }

  async preview(workspaceId: string, repoId: string, path: string): Promise<SpecPreview> {
    const row = await this.resolveRepo(workspaceId, repoId);
    if (!row.clonePath) throw new NotFoundError('Repo has no clone on disk');
    try {
      const content = await this.container.git.readMarkdown(
        { owner: row.owner, name: row.name },
        path,
        MAX_DOC_BYTES,
      );
      return { path, content };
    } catch (err) {
      if (err instanceof InvalidMarkdownPathError) throw new ValidationError(err.message);
      if (isNotFound(err)) throw new NotFoundError('Document not found');
      if (readFailureReason(err) === 'too_large') throw new ValidationError('Document too large');
      throw err;
    }
  }
}
