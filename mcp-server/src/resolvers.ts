import type { ApiClient } from './api-client.js';
import type { Agent, PrMeta, Repo } from './api-types.js';
import { agentAmbiguous, agentNotFound, prNotFound, repoNotFound } from './errors.js';

/** Resolve `owner/name` to the imported Repo, or throw an actionable error. */
export async function resolveRepo(client: ApiClient, repo: string): Promise<Repo> {
  const repos = await client.listRepos();
  const match = repos.find((r) => r.full_name.toLowerCase() === repo.toLowerCase());
  if (!match) throw repoNotFound(repo);
  return match;
}

/** Resolve a PR number to its DevDigest-internal PrMeta (with a non-null `id`),
 *  or throw an actionable error. */
export async function resolvePull(
  client: ApiClient,
  repo: Repo,
  pr: number,
): Promise<PrMeta & { id: string }> {
  const pulls = await client.listPulls(repo.id);
  const match = pulls.find((p) => p.number === pr);
  if (!match || !match.id) throw prNotFound(repo.full_name, pr);
  return { ...match, id: match.id };
}

/**
 * Resolve an agent id or name.
 * Policy: try an exact id match first; otherwise a case-insensitive name
 * match. If the name matches more than one agent, throw and tell the caller
 * to use the id instead — never guess.
 */
export async function resolveAgent(client: ApiClient, agent: string): Promise<Agent> {
  const agents = await client.listAgents();

  const byId = agents.find((a) => a.id === agent);
  if (byId) return byId;

  const byName = agents.filter((a) => a.name.toLowerCase() === agent.toLowerCase());
  if (byName.length === 1) return byName[0]!;
  if (byName.length > 1) {
    throw agentAmbiguous(
      agent,
      byName.map((a) => a.id),
    );
  }
  throw agentNotFound(agent);
}
