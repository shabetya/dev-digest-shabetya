import type { ApiClient } from '../api-client.js';
import { toAgentSummary, type AgentSummary } from '../shape.js';

export const listAgentsTool = {
  name: 'list_agents',
  description:
    "List the reviewer agents configured in this DevDigest workspace. Returns each agent's " +
    "id, name, provider, model, and enabled status. Use the returned id (or name) as the " +
    "`agent` argument for `run_agent_on_pr` and `get_findings`. Call this first if you don't " +
    'already know a valid agent id or name.',
  inputSchema: {},
};

export async function listAgents(client: ApiClient): Promise<{ agents: AgentSummary[] }> {
  const agents = await client.listAgents();
  return { agents: agents.map(toAgentSummary) };
}
