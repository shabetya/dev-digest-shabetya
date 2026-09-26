/**
 * Actionable error helpers, used by every resolver and tool handler so
 * wording stays consistent. Cross-cutting convention: "errors lead the
 * agent forward" — never a bare "not found". Each helper's message tells
 * the caller what to try next (call `list_agents`, check the repo is
 * imported, call `run_agent_on_pr` first, etc.).
 */

export class McpToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'McpToolError';
  }
}

export function apiUnreachable(apiUrl: string, cause?: unknown): McpToolError {
  const detail = cause instanceof Error ? cause.message : String(cause ?? '');
  return new McpToolError(
    `Could not reach the DevDigest API at ${apiUrl}. Is ./scripts/dev.sh running? ` +
      `Set DEVDIGEST_API_URL if the API runs on a different host/port.` +
      (detail ? ` (${detail})` : ''),
  );
}

export function apiError(method: string, path: string, status: number, body: string): McpToolError {
  return new McpToolError(
    `DevDigest API returned ${status} for ${method} ${path}: ${body || '(empty body)'}`,
  );
}

export function repoNotFound(repo: string): McpToolError {
  return new McpToolError(
    `Repo "${repo}" is not imported into DevDigest. Import it first (POST /repos in the ` +
      `DevDigest UI or API), or check the "owner/name" spelling and call again.`,
  );
}

export function prNotFound(repo: string, pr: number): McpToolError {
  return new McpToolError(
    `PR #${pr} was not found for repo "${repo}". Check the PR number, or confirm the repo ` +
      `has been synced in DevDigest (its pull list may need a refresh).`,
  );
}

export function agentNotFound(agent: string): McpToolError {
  return new McpToolError(
    `No agent found matching "${agent}". Call list_agents first to see the valid ids and ` +
      `names configured in this workspace.`,
  );
}

export function agentAmbiguous(agent: string, matchIds: string[]): McpToolError {
  return new McpToolError(
    `Agent name "${agent}" matches more than one agent (ids: ${matchIds.join(', ')}). ` +
      `Call list_agents and pass one of those ids instead of the name.`,
  );
}

export function noCompletedRun(repo: string, pr: number, agent?: string): McpToolError {
  const scope = agent ? ` for agent "${agent}"` : '';
  return new McpToolError(
    `No completed review found for ${repo}#${pr}${scope}. Call run_agent_on_pr first to ` +
      `produce one, then call get_findings again.`,
  );
}

export function runTimedOut(runId: string, timeoutMs: number): McpToolError {
  return new McpToolError(
    `Timed out after ${timeoutMs}ms waiting for run ${runId} to finish. The review may still ` +
      `be running on the server — check the DevDigest UI, or call get_findings shortly to see ` +
      `if it has completed since.`,
  );
}

export function notImplemented(): { status: 'not_implemented' } {
  return { status: 'not_implemented' };
}
