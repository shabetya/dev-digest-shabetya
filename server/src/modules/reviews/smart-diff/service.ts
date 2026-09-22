import type { Container } from '../../../platform/container.js';
import type { SmartDiff, SmartDiffGroup, SmartDiffRole } from '@devdigest/shared';
import { NotFoundError } from '../../../platform/errors.js';
import { classifyFile } from './classify.js';

/** Fixed display/priority order every Smart Diff response groups files in —
 *  ALL FIVE groups render unconditionally, even ones with `files: []`. */
const GROUP_ORDER: SmartDiffRole[] = ['core', 'tests', 'wiring', 'docs', 'boilerplate'];

/**
 * Smart Diff — groups a PR's changed files by role (core/tests/wiring/docs/
 * boilerplate) and annotates each file with the LATEST review's finding
 * lines. Computed on the fly from `pr_files` + `reviews`/`findings`; nothing
 * is persisted. A plain function (no LLM call, no class needed) — kept
 * DB-dependent only via the injected container, unlike `classifyFile` which
 * stays pure.
 */
export async function getSmartDiff(
  container: Container,
  workspaceId: string,
  prId: string,
): Promise<SmartDiff> {
  // Workspace-scoping guard FIRST — `getPrFiles` itself is not workspace
  // scoped, so a caller could otherwise read another workspace's PR files by
  // guessing a prId. Mirrors IntentService.getIntent's guard-then-fetch.
  const pull = await container.reviewRepo.getPull(workspaceId, prId);
  if (!pull) throw new NotFoundError('Pull request not found');

  const files = await container.reviewRepo.getPrFiles(prId);

  // Reviews come back newest-first; only the LATEST review's findings feed
  // finding_lines — an older, superseded review's findings must never appear
  // current. No reviews yet → treat findings as empty.
  const reviews = await container.reviewRepo.reviewsForPull(prId);
  const latestFindings = reviews[0]?.findings ?? [];

  const findingLinesByPath = new Map<string, Set<number>>();
  for (const finding of latestFindings) {
    const lines = findingLinesByPath.get(finding.file) ?? new Set<number>();
    lines.add(finding.startLine);
    findingLinesByPath.set(finding.file, lines);
  }

  const filesByRole = new Map<SmartDiffRole, SmartDiffGroup['files']>();
  for (const role of GROUP_ORDER) filesByRole.set(role, []);

  let totalLines = 0;
  for (const file of files) {
    totalLines += file.additions + file.deletions;
    const role = classifyFile(file.path);
    const findingLines = [...(findingLinesByPath.get(file.path) ?? [])].sort((a, b) => a - b);
    filesByRole.get(role)!.push({
      path: file.path,
      additions: file.additions,
      deletions: file.deletions,
      finding_lines: findingLines,
    });
  }

  const groups: SmartDiffGroup[] = GROUP_ORDER.map((role) => ({
    role,
    files: filesByRole.get(role)!,
  }));

  return {
    groups,
    split_suggestion: { too_big: false, total_lines: totalLines, proposed_splits: [] },
  };
}
