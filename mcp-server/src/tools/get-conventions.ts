import { z } from 'zod';
import type { ApiClient } from '../api-client.js';
import { resolveRepo } from '../resolvers.js';
import type { ConventionCandidate } from '../api-types.js';

export const getConventionsTool = {
  name: 'get_conventions',
  description:
    "Get this repository's accepted coding conventions, as extracted and approved in " +
    "DevDigest's Conventions workflow. Use this to check a PR against house style alongside " +
    'or before a review.',
  inputSchema: {
    repo: z.string().describe('Repository in `owner/name` form, must already be imported into DevDigest.'),
  },
};

export interface GetConventionsArgs {
  repo: string;
}

export async function getConventions(
  client: ApiClient,
  args: GetConventionsArgs,
): Promise<{ conventions: ConventionCandidate[] }> {
  const repo = await resolveRepo(client, args.repo);
  const conventions = await client.getConventions(repo.id);
  return { conventions };
}
