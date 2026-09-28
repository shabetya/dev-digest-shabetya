import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../src/api-client.js';
import type { ActiveRun } from '../src/api-types.js';
import { waitForRunCompletion } from '../src/poll.js';

const CONFIG = { pollIntervalMs: 1000, pollTimeoutMs: 5000 };

function fakeClient(getActiveRuns: () => Promise<ActiveRun[]>): ApiClient {
  return { getActiveRuns } as unknown as ApiClient;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('waitForRunCompletion', () => {
  it('resolves once the run drops out of the active-runs list', async () => {
    let call = 0;
    const client = fakeClient(async () => {
      call += 1;
      // Still running for the first two checks, then done.
      return call <= 2 ? [{ run_id: 'run-1', agent_id: 'a1', agent_name: 'Bot', ran_at: null }] : [];
    });

    const promise = waitForRunCompletion(client, 'pr-1', 'run-1', CONFIG);
    await vi.advanceTimersByTimeAsync(CONFIG.pollIntervalMs * 3);

    await expect(promise).resolves.toBeUndefined();
    expect(call).toBeGreaterThanOrEqual(3);
  });

  it('rejects with an actionable timeout error if the run never completes', async () => {
    const client = fakeClient(async () => [
      { run_id: 'run-1', agent_id: 'a1', agent_name: 'Bot', ran_at: null },
    ]);

    const promise = waitForRunCompletion(client, 'pr-1', 'run-1', CONFIG);
    // Swallow the eventual rejection so it isn't reported as unhandled while
    // we advance timers below.
    const assertion = expect(promise).rejects.toThrow(/Timed out after 5000ms/);

    await vi.advanceTimersByTimeAsync(CONFIG.pollTimeoutMs + CONFIG.pollIntervalMs * 2);

    await assertion;
  });
});
