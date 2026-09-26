import type { Container } from '../../platform/container.js';
import type { BlastRadiusResponse } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { mapBlastResult } from './helpers.js';
import { PRIOR_PRS_LIMIT } from './constants.js';

/**
 * Blast Radius — read-only, pre-calculated impact map (which symbols
 * changed, who calls them, which HTTP endpoints/cron jobs depend on them).
 * All data comes from `container.repoIntel.getBlastRadius`; nothing here
 * runs fresh analysis or calls an LLM.
 */
export async function getBlast(
  container: Container,
  workspaceId: string,
  prId: string,
): Promise<BlastRadiusResponse> {
  // Workspace-scoping guard FIRST — `getPrFiles` itself is not workspace
  // scoped, so a caller could otherwise read another workspace's PR files by
  // guessing a prId. Mirrors getSmartDiff's guard-then-fetch (see
  // reviews/smart-diff/service.ts).
  const pull = await container.reviewRepo.getPull(workspaceId, prId);
  if (!pull) throw new NotFoundError('Pull request not found');

  const files = await container.reviewRepo.getPrFiles(prId);
  const filePaths = files.map((f) => f.path);
  const [result, priorPrs] = await Promise.all([
    container.repoIntel.getBlastRadius(pull.repoId, filePaths),
    container.reviewRepo.priorPrsTouchingFiles({
      repoId: pull.repoId,
      excludePrId: prId,
      filePaths,
      limit: PRIOR_PRS_LIMIT,
    }),
  ]);
  return mapBlastResult(result, priorPrs);
}
