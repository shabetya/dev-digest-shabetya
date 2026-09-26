import type { ApiClient } from './api-client.js';
import type { Config } from './config.js';
import { runTimedOut } from './errors.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Bounded poll loop for `run_agent_on_pr`. Polls `GET /pulls/:id/runs/active`
 * every `pollIntervalMs` until `runId` is no longer present in that list —
 * its presence/absence IS the "still running" signal (the active-runs list
 * has no separate `status` field; the server already filters it to
 * `status='running'`). Bounded by `pollTimeoutMs`: on timeout, throws an
 * actionable error rather than hanging forever.
 */
export async function waitForRunCompletion(
  client: ApiClient,
  prId: string,
  runId: string,
  config: Pick<Config, 'pollIntervalMs' | 'pollTimeoutMs'>,
): Promise<void> {
  const start = Date.now();
  for (;;) {
    const active = await client.getActiveRuns(prId);
    if (!active.some((r) => r.run_id === runId)) return;
    if (Date.now() - start >= config.pollTimeoutMs) {
      throw runTimedOut(runId, config.pollTimeoutMs);
    }
    await sleep(config.pollIntervalMs);
  }
}
