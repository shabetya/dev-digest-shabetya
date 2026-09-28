import { describe, expect, it } from 'vitest';
import {
  agentAmbiguous,
  agentNotFound,
  apiError,
  apiUnreachable,
  McpToolError,
  noCompletedRun,
  notImplemented,
  prNotFound,
  repoNotFound,
  runTimedOut,
} from '../src/errors.js';

describe('error helpers', () => {
  it('every helper leads the caller forward, not a bare "not found"', () => {
    expect(repoNotFound('acme/widgets').message).toMatch(/import it first/i);
    expect(prNotFound('acme/widgets', 42).message).toMatch(/check the pr number/i);
    expect(agentNotFound('mystery').message).toMatch(/call list_agents first/i);
    expect(noCompletedRun('acme/widgets', 42).message).toMatch(/call run_agent_on_pr first/i);
    expect(runTimedOut('run-1', 180_000).message).toMatch(/check the devdigest ui/i);
  });

  it('agentAmbiguous names the candidate ids and tells the caller to use one', () => {
    const err = agentAmbiguous('Style Bot', ['agent-2', 'agent-3']);
    expect(err.message).toContain('agent-2');
    expect(err.message).toContain('agent-3');
    expect(err.message).toMatch(/pass one of those ids/i);
  });

  it('apiUnreachable names the configured URL and points at ./scripts/dev.sh', () => {
    const err = apiUnreachable('http://localhost:3001', new Error('fetch failed'));
    expect(err).toBeInstanceOf(McpToolError);
    expect(err.message).toContain('http://localhost:3001');
    expect(err.message).toMatch(/scripts\/dev\.sh/);
    expect(err.message).toContain('fetch failed');
  });

  it('apiError surfaces the method, path, and status', () => {
    const err = apiError('POST', '/pulls/pr-1/review', 500, 'boom');
    expect(err.message).toContain('POST');
    expect(err.message).toContain('/pulls/pr-1/review');
    expect(err.message).toContain('500');
    expect(err.message).toContain('boom');
  });

  it('notImplemented always returns the literal marker, never fabricated data', () => {
    expect(notImplemented()).toEqual({ status: 'not_implemented' });
  });
});
