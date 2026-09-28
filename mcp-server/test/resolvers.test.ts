import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../src/api-client.js';
import type { Agent, PrMeta, Repo } from '../src/api-types.js';
import { resolveAgent, resolvePull, resolveRepo } from '../src/resolvers.js';

const REPO: Repo = { id: 'repo-1', owner: 'acme', name: 'widgets', full_name: 'acme/widgets' };

const AGENTS: Agent[] = [
  { id: 'agent-1', name: 'Security Bot', provider: 'openai', model: 'gpt-4.1', enabled: true },
  { id: 'agent-2', name: 'Style Bot', provider: 'openai', model: 'gpt-4.1', enabled: true },
  { id: 'agent-3', name: 'Style Bot', provider: 'anthropic', model: 'claude', enabled: false },
];

const PULLS: PrMeta[] = [
  { id: 'pr-1', number: 42, title: 'Add feature', status: 'open' },
  { id: null, number: 7, title: 'Untracked', status: 'open' },
];

function fakeClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    listRepos: vi.fn().mockResolvedValue([REPO]),
    listPulls: vi.fn().mockResolvedValue(PULLS),
    listAgents: vi.fn().mockResolvedValue(AGENTS),
    ...overrides,
  } as unknown as ApiClient;
}

describe('resolveRepo', () => {
  it('finds a repo by case-insensitive owner/name and throws an actionable error otherwise', async () => {
    const client = fakeClient();

    await expect(resolveRepo(client, 'ACME/Widgets')).resolves.toEqual(REPO);
    await expect(resolveRepo(client, 'acme/missing')).rejects.toThrow(
      /not imported into DevDigest/,
    );
  });
});

describe('resolvePull', () => {
  it('finds a pull by number and rejects one with no DevDigest id', async () => {
    const client = fakeClient();

    await expect(resolvePull(client, REPO, 42)).resolves.toEqual({ ...PULLS[0], id: 'pr-1' });
    await expect(resolvePull(client, REPO, 7)).rejects.toThrow(/PR #7 was not found/);
    await expect(resolvePull(client, REPO, 999)).rejects.toThrow(/PR #999 was not found/);
  });
});

describe('resolveAgent', () => {
  it('matches an exact id first', async () => {
    const client = fakeClient();
    await expect(resolveAgent(client, 'agent-2')).resolves.toEqual(AGENTS[1]);
  });

  it('falls back to a unique case-insensitive name match', async () => {
    const client = fakeClient();
    await expect(resolveAgent(client, 'security bot')).resolves.toEqual(AGENTS[0]);
  });

  it('throws telling the caller to use the id when a name is ambiguous', async () => {
    const client = fakeClient();
    await expect(resolveAgent(client, 'Style Bot')).rejects.toThrow(
      /matches more than one agent.*pass one of those ids/is,
    );
  });

  it('throws an actionable not-found error for no match', async () => {
    const client = fakeClient();
    await expect(resolveAgent(client, 'nope')).rejects.toThrow(/No agent found matching "nope"/);
  });
});
