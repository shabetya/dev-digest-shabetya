import { z } from 'zod';
import type { ApiClient } from '../api-client.js';
import type { BlastRadius } from '../api-types.js';
import { resolvePull, resolveRepo } from '../resolvers.js';

export const getBlastRadiusTool = {
  name: 'get_blast_radius',
  description:
    "Get the pre-calculated impact map for a pull request's changed symbols: which functions " +
    'changed, who calls them, and which HTTP endpoints/cron jobs depend on them. Read-only — ' +
    'never runs fresh analysis or an LLM call, so it is safe to call at any time. May come back ' +
    '`degraded` (with a `degraded_reason`) when the repo has not been fully indexed yet; treat ' +
    'that as a partial-data signal, not an error.',
  inputSchema: {
    repo: z.string().describe('Repository in `owner/name` form, must already be imported into DevDigest.'),
    pr: z.number().int().describe("Pull request number (not DevDigest's internal id)."),
  },
  annotations: { readOnlyHint: true },
};

export interface GetBlastRadiusArgs {
  repo: string;
  pr: number;
}

export async function getBlastRadius(client: ApiClient, args: GetBlastRadiusArgs): Promise<BlastRadius> {
  const repo = await resolveRepo(client, args.repo);
  const pull = await resolvePull(client, repo, args.pr);
  return client.getBlastRadius(pull.id);
}
