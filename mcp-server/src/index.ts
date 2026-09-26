#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ApiClient } from './api-client.js';
import { loadConfig } from './config.js';
import { McpToolError } from './errors.js';
import { getBlastRadius, getBlastRadiusTool } from './tools/get-blast-radius.js';
import { getConventions, getConventionsTool } from './tools/get-conventions.js';
import { getFindings, getFindingsTool } from './tools/get-findings.js';
import { listAgents, listAgentsTool } from './tools/list-agents.js';
import { runAgentOnPr, runAgentOnPrTool } from './tools/run-agent-on-pr.js';

/**
 * MCP server bootstrap. Talks over stdio (for local MCP clients like Claude
 * Desktop/Code); pure HTTP client against the already-running @devdigest/api
 * server, no direct DB/DI access. Fails fast at startup if the API isn't
 * reachable rather than hanging silently on the first tool call.
 */

/** Wraps a tool's plain-object result/error into MCP's CallToolResult shape,
 *  so tool handlers themselves stay pure functions with no MCP SDK
 *  dependency (and are unit-testable without it). */
function toCallToolResult(fn: () => Promise<unknown>) {
  return async () => {
    try {
      const result = await fn();
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      const message = err instanceof McpToolError || err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text' as const, text: message }], isError: true };
    }
  };
}

async function main() {
  const config = loadConfig();
  const client = new ApiClient(config);

  // Fail fast, never hang silently.
  await client.checkConnectivity();

  const server = new McpServer({ name: 'devdigest', version: '0.0.0' });

  server.registerTool(
    listAgentsTool.name,
    { description: listAgentsTool.description, inputSchema: listAgentsTool.inputSchema },
    toCallToolResult(() => listAgents(client)),
  );

  server.registerTool(
    runAgentOnPrTool.name,
    { description: runAgentOnPrTool.description, inputSchema: runAgentOnPrTool.inputSchema },
    (args) => toCallToolResult(() => runAgentOnPr(client, config, args))(),
  );

  server.registerTool(
    getFindingsTool.name,
    { description: getFindingsTool.description, inputSchema: getFindingsTool.inputSchema },
    (args) => toCallToolResult(() => getFindings(client, args))(),
  );

  server.registerTool(
    getConventionsTool.name,
    { description: getConventionsTool.description, inputSchema: getConventionsTool.inputSchema },
    (args) => toCallToolResult(() => getConventions(client, args))(),
  );

  server.registerTool(
    getBlastRadiusTool.name,
    {
      description: getBlastRadiusTool.description,
      inputSchema: getBlastRadiusTool.inputSchema,
      annotations: getBlastRadiusTool.annotations,
    },
    (args) => toCallToolResult(() => getBlastRadius(client, args))(),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('devdigest-mcp-server failed to start:', err instanceof Error ? err.message : err);
  process.exit(1);
});
