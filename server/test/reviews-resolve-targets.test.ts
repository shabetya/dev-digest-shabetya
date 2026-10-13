import { describe, it, expect, vi } from 'vitest';
import type { Container } from '../src/platform/container.js';
import type { AgentRow } from '../src/db/rows.js';
import { ReviewService } from '../src/modules/reviews/service.js';
import { AppError, NotFoundError } from '../src/platform/errors.js';

/**
 * Unit coverage for `ReviewService.resolveTargets` — the run-request mode
 * resolution (AC-8/9/10). No DB: `container.agentsRepo` is a hand-built stub
 * (getById/listEnabled/getByIds), which is all this method touches; the
 * service's other collaborators (ReviewRepository, ReviewRunExecutor,
 * IntentService) only store the container in their constructors, so a
 * minimal fake is enough to construct a real `ReviewService`.
 */
function agentRow(id: string, name: string): AgentRow {
  return {
    id,
    workspaceId: 'ws-1',
    name,
    description: '',
    provider: 'openai',
    model: 'gpt-4.1',
    systemPrompt: 's',
    outputSchema: null,
    strategy: 'single-pass',
    ciFailOn: 'critical',
    repoIntel: true,
    enabled: true,
    version: 1,
    createdBy: null,
    createdAt: new Date(),
  } as unknown as AgentRow;
}

function buildService(agents: AgentRow[]) {
  const getById = vi.fn(async (_wsId: string, id: string) => agents.find((a) => a.id === id));
  const listEnabled = vi.fn(async () => agents.filter((a) => a.enabled));
  const getByIds = vi.fn(async (_wsId: string, ids: string[]) =>
    agents.filter((a) => ids.includes(a.id)),
  );
  const fakeContainer = {
    db: {} as never,
    agentsRepo: { getById, listEnabled, getByIds },
  } as unknown as Container;
  return { service: new ReviewService(fakeContainer), getById, listEnabled, getByIds };
}

describe('ReviewService.resolveTargets', () => {
  const a1 = agentRow('a1', 'Security');
  const a2 = agentRow('a2', 'Performance');

  it('agentIds mode resolves exactly the requested subset (AC-8)', async () => {
    const { service, getByIds } = buildService([a1, a2]);
    const targets = await service.resolveTargets('ws-1', { agentIds: ['a1', 'a2'] });
    expect(targets.map((a) => a.id)).toEqual(['a1', 'a2']);
    expect(getByIds).toHaveBeenCalledWith('ws-1', ['a1', 'a2']);
  });

  it('rejects when more than one of agentId/all/agentIds is supplied (AC-9)', async () => {
    const { service } = buildService([a1, a2]);
    await expect(
      service.resolveTargets('ws-1', { agentId: 'a1', agentIds: ['a2'] }),
    ).rejects.toMatchObject({ code: 'invalid_run_request', statusCode: 400 });
    await expect(
      service.resolveTargets('ws-1', { all: true, agentIds: ['a2'] }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('rejects the whole request 404 agent_not_found when an id does not resolve (AC-10)', async () => {
    const { service } = buildService([a1]);
    await expect(
      service.resolveTargets('ws-1', { agentIds: ['a1', 'missing'] }),
    ).rejects.toMatchObject({ code: 'agent_not_found', statusCode: 404 });
  });

  it('rejects an empty agentIds array rather than silently running zero agents', async () => {
    const { service } = buildService([a1]);
    await expect(service.resolveTargets('ws-1', { agentIds: [] })).rejects.toMatchObject({
      code: 'invalid_run_request',
    });
  });

  it('still supports the existing all and single-agentId modes unchanged', async () => {
    const { service } = buildService([a1, a2]);
    const all = await service.resolveTargets('ws-1', { all: true });
    expect(all.map((a) => a.id)).toEqual(['a1', 'a2']);

    const single = await service.resolveTargets('ws-1', { agentId: 'a1' });
    expect(single.map((a) => a.id)).toEqual(['a1']);
  });

  it('404s (not agent_not_found) for a single unknown agentId — unchanged behavior', async () => {
    const { service } = buildService([]);
    await expect(service.resolveTargets('ws-1', { agentId: 'nope' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('rejects a request with none of agentId/all/agentIds', async () => {
    const { service } = buildService([a1]);
    await expect(service.resolveTargets('ws-1', {})).rejects.toMatchObject({
      code: 'invalid_run_request',
    });
  });
});
