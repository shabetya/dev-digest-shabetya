import type { ProjectContextDetail } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { MAX_CONTEXT_TOKENS, MAX_DOC_BYTES } from '../../adapters/git/constants.js';
import { DocTooLargeError } from '../../adapters/git/markdown-path.js';
import { sanitizePathForHeading } from '../_shared/sanitize.js';

/** The only logging surface `loadProjectContext` needs (a `RunLogger` satisfies it). */
export interface ProjectContextLogger {
  info(msg: string): void;
}

/** Result of resolving an agent's attached docs for one run (AC-14..18). */
export interface ProjectContextResult {
  /** Server-preformatted `### <path>` entries, one per injected doc. */
  specs: string[];
  /** Paths actually injected. */
  specsRead: string[];
  /** Per-doc outcome (injected or skipped + reason) for the trace. */
  detail: ProjectContextDetail[];
}

/**
 * Read each attached doc from the synced default-branch clone. Never throws:
 * every failure becomes a skip with a reason and a run-log line naming the path.
 * Docs are never truncated; once the running token total would exceed the
 * budget, that doc and all later ones are skipped as `budget_exceeded`.
 */
export async function loadProjectContext(
  container: Container,
  repo: { owner: string; name: string; clonePath: string | null; defaultBranch: string },
  paths: string[],
  runLog: ProjectContextLogger,
): Promise<ProjectContextResult> {
  const out: ProjectContextResult = { specs: [], specsRead: [], detail: [] };
  if (paths.length === 0) return out;

  const skip = (path: string, reason: NonNullable<ProjectContextDetail['reason']>, tokens = 0) => {
    out.detail.push({ path, tokens, status: 'skipped', reason });
    runLog.info(`project context: skipped "${sanitizePathForHeading(path)}" (${reason})`);
  };

  if (!repo.clonePath) {
    runLog.info('project context: no clone, project context skipped');
    for (const p of paths) out.detail.push({ path: p, tokens: 0, status: 'skipped', reason: 'no_clone' });
    return out;
  }

  const ref = { owner: repo.owner, name: repo.name };
  // The run path does not otherwise sync the clone; docs must come from the
  // current default branch. Best-effort: a failed sync reads the existing clone.
  try {
    await container.git.sync(ref, repo.defaultBranch);
  } catch (err) {
    runLog.info(`project context: clone sync failed, using existing checkout — ${(err as Error).message}`);
  }

  let total = 0;
  let overBudget = false;
  for (const path of paths) {
    if (overBudget) {
      skip(path, 'budget_exceeded');
      continue;
    }
    let content: string;
    try {
      content = await container.git.readMarkdown(ref, path, MAX_DOC_BYTES);
    } catch (err) {
      skip(path, err instanceof DocTooLargeError ? 'too_large' : 'unreadable');
      continue;
    }
    if (content.trim().length === 0) {
      skip(path, 'empty');
      continue;
    }
    const tokens = container.tokenizer.count(content);
    if (total + tokens > MAX_CONTEXT_TOKENS) {
      overBudget = true;
      skip(path, 'budget_exceeded', tokens);
      continue;
    }
    total += tokens;
    out.specs.push(`### ${sanitizePathForHeading(path)}\n${content}`);
    out.specsRead.push(path);
    out.detail.push({ path, tokens, status: 'injected' });
  }
  if (out.specsRead.length > 0) {
    runLog.info(`project context: ${out.specsRead.length} doc(s) injected (~${total} tokens)`);
  }
  return out;
}
