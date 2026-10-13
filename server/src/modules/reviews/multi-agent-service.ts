import type { Container } from '../../platform/container.js';
import type { MultiAgentRun } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { ReviewRepository } from './repository.js';
import { computeConflicts, shouldComputeConflicts, toAgentColumn } from './multi-agent-helpers.js';

/**
 * Multi-Agent Review (SPEC-05) — sibling service to `ReviewService`, same
 * composition pattern as `IntentService`: constructed per-request in
 * `routes.ts`, owns one read-side concern (the combined multi-run detail),
 * and talks to the reviews module's own repository directly (same module,
 * not a cross-module DI pull — see `AgentsService.estimates` for the
 * cross-module case, which goes through `container.reviewRepo`).
 */
export class MultiAgentRunService {
  private repo: ReviewRepository;

  constructor(container: Container) {
    this.repo = new ReviewRepository(container.db);
  }

  /**
   * One combined payload for the results page: every tagged `agent_runs` row
   * as a `columns` entry (including "run deleted" placeholders) AND the
   * `conflicts` disagreement panel, computed in the same call — never two
   * round-trips (AC-12). `conflicts` is empty whenever there's nothing to
   * compare (AC-17) or most columns are still in flight (see
   * `shouldComputeConflicts`) — `conflicts_status` tells the client WHICH of
   * those two empty-looking cases it's in (`'pending'` vs. `'computed'`),
   * reusing `shouldComputeConflicts`'s own condition rather than a second,
   * potentially-drifting check.
   */
  async getDetail(workspaceId: string, multiRunId: string): Promise<MultiAgentRun> {
    const detail = await this.repo.getMultiAgentRunDetail(workspaceId, multiRunId);
    if (!detail) throw new NotFoundError('Multi-agent run not found');

    const pull = await this.repo.getPull(workspaceId, detail.prId);

    const columns = detail.columns.map(toAgentColumn);
    const readyToCompute = shouldComputeConflicts(columns);

    const conflicts = readyToCompute
      ? computeConflicts(
          detail.columns.map((c) => ({ agentId: c.agentId, agentName: c.agentName })),
          detail.columns.map((c) => ({
            agentId: c.agentId,
            agentName: c.agentName,
            findings: c.findings,
          })),
        )
      : [];

    const durations = columns.map((c) => c.duration_ms).filter((d): d is number => d != null);
    const costs = columns.map((c) => c.cost_usd).filter((c): c is number => c != null);

    return {
      id: detail.id,
      pr_id: detail.prId,
      pr_number: pull?.number ?? null,
      ran_at: detail.ranAt.toISOString(),
      agent_count: columns.length,
      total_duration_ms: durations.reduce((sum, d) => sum + d, 0),
      total_cost_usd: costs.length > 0 ? costs.reduce((sum, c) => sum + c, 0) : null,
      columns,
      conflicts,
      conflicts_status: readyToCompute ? 'computed' : 'pending',
    };
  }
}
