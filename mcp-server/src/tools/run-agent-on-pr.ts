import { z } from 'zod';
import type { ApiClient } from '../api-client.js';
import type { Config } from '../config.js';
import { McpToolError, noCompletedRun } from '../errors.js';
import { waitForRunCompletion } from '../poll.js';
import { resolveAgent, resolvePull, resolveRepo } from '../resolvers.js';
import { toReviewResult, type ReviewResult } from '../shape.js';

export const runAgentOnPrTool = {
  name: 'run_agent_on_pr',
  description:
    'Run a specific reviewer agent on a pull request end-to-end: creates a review run, waits ' +
    'for it to finish, and returns the verdict and findings. This is the only tool that ' +
    'triggers a new LLM review — if you just want the result of a run that already happened, ' +
    "call `get_findings` instead, it's faster and free of side effects. Can take up to a few " +
    "minutes; don't call it repeatedly while waiting. The PR must already be imported into " +
    'DevDigest.',
  inputSchema: {
    repo: z.string().describe('Repository in `owner/name` form, must already be imported into DevDigest.'),
    pr: z.number().int().describe("Pull request number (not DevDigest's internal id)."),
    agent: z
      .string()
      .describe(
        'Agent id or name, from `list_agents`. If a name matches more than one agent, this ' +
          'call fails and asks you to use the id instead.',
      ),
  },
};

export interface RunAgentOnPrArgs {
  repo: string;
  pr: number;
  agent: string;
}

export async function runAgentOnPr(
  client: ApiClient,
  config: Config,
  args: RunAgentOnPrArgs,
): Promise<ReviewResult> {
  const repo = await resolveRepo(client, args.repo);
  const pull = await resolvePull(client, repo, args.pr);
  const agent = await resolveAgent(client, args.agent);

  const triggered = await client.triggerReview(pull.id, agent.id);
  const target = triggered.runs[0];
  if (!target) {
    throw new McpToolError(
      `DevDigest accepted the review request for ${repo.full_name}#${args.pr} but returned no ` +
        'run id — this looks like a server-side bug, not a caller error.',
    );
  }

  await waitForRunCompletion(client, pull.id, target.run_id, config);

  const reviews = await client.getReviews(pull.id);
  const review = reviews.find((r) => r.run_id === target.run_id);
  if (!review) throw noCompletedRun(repo.full_name, args.pr, agent.name);

  return toReviewResult(review);
}
