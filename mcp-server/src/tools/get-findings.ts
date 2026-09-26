import { z } from 'zod';
import type { ApiClient } from '../api-client.js';
import { noCompletedRun } from '../errors.js';
import { resolveAgent, resolvePull, resolveRepo } from '../resolvers.js';
import { toReviewResult, type ReviewResult } from '../shape.js';

export const getFindingsTool = {
  name: 'get_findings',
  description:
    'Get the verdict and findings from the most recently completed review run for a pull ' +
    'request, without starting a new one. If no run has completed yet, returns an error ' +
    'telling you to call `run_agent_on_pr` first. Pass `agent` to get a specific agent\'s ' +
    'review; omit it to get the most recent review from any agent.',
  inputSchema: {
    repo: z.string().describe('Repository in `owner/name` form, must already be imported into DevDigest.'),
    pr: z.number().int().describe("Pull request number (not DevDigest's internal id)."),
    agent: z
      .string()
      .optional()
      .describe(
        "Optional. Agent id or name to filter to one agent's review. Omit for the most recent " +
          'review regardless of which agent ran it.',
      ),
  },
};

export interface GetFindingsArgs {
  repo: string;
  pr: number;
  agent?: string;
}

export async function getFindings(client: ApiClient, args: GetFindingsArgs): Promise<ReviewResult> {
  const repo = await resolveRepo(client, args.repo);
  const pull = await resolvePull(client, repo, args.pr);

  // Newest first (server orders reviewsForPull by created_at desc).
  const reviews = await client.getReviews(pull.id);

  if (!args.agent) {
    const latest = reviews[0];
    if (!latest) throw noCompletedRun(repo.full_name, args.pr);
    return toReviewResult(latest);
  }

  const agent = await resolveAgent(client, args.agent);
  const match = reviews.find((r) => r.agent_id === agent.id);
  if (!match) throw noCompletedRun(repo.full_name, args.pr, agent.name);
  return toReviewResult(match);
}
