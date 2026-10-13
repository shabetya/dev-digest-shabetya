import type { Agent, AgentEstimate } from "@devdigest/shared";

/** Pure selection-state + estimate helpers for the multi-agent picker. No
   hooks here — plain functions, directly unit-testable. */

/** Default selection when the panel first opens: every enabled agent
   pre-checked (mirrors the old "Run all enabled agents" default), with
   disabled agents still listed (per AC-1) but unchecked by default. */
export function defaultSelection(agents: Agent[]): Set<string> {
  return new Set(agents.filter((a) => a.enabled).map((a) => a.id));
}

export function toggleOne(selected: Set<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function selectAll(agents: Agent[]): Set<string> {
  return new Set(agents.map((a) => a.id));
}

/** Look up one agent's estimate by id; undefined when the estimates query
   hasn't resolved yet (treated the same as "no history yet" by the caller). */
export function estimateFor(
  estimates: AgentEstimate[] | undefined,
  agentId: string,
): AgentEstimate | undefined {
  return estimates?.find((e) => e.agent_id === agentId);
}
