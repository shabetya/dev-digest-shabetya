import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { PollingRepository } from './repository.js';

/**
 * F1 — polling service. MANUAL refresh that ONLY syncs the PR list
 * (new/updated PRs appear, head_sha updates). It does NOT trigger any review —
 * review is manual (user presses Run Review, owned by A2).
 */
export class PollingService {
  private repo: PollingRepository;

  constructor(private container: Container) {
    this.repo = new PollingRepository(container.db);
  }

  async pollRepo(
    workspaceId: string,
    repoId: string,
  ): Promise<{ synced: number; reviewTriggered: false }> {
    const repo = await this.repo.getRepoInWorkspace(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const gh = await this.container.github();
    const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
    let synced = 0;
    for (const pr of pulls) {
      await this.repo.upsertFromList(workspaceId, repo.id, pr);
      synced++;
    }
    await this.repo.bumpLastPolledAt(repo.id);

    // NOTE: no review is triggered here — manual trigger only.
    return { synced, reviewTriggered: false };
  }
}
