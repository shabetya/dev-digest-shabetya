import type { Agent, AgentEstimate } from "@devdigest/shared";

/** Pure selection + combined-estimate helpers for Configure Run — no hooks,
   directly unit-testable. */

export function toggleOne(selected: Set<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function selectAllIds(agents: Agent[]): Set<string> {
  return new Set(agents.map((a) => a.id));
}

export function estimateFor(
  estimates: AgentEstimate[] | undefined,
  agentId: string,
): AgentEstimate | undefined {
  return estimates?.find((e) => e.agent_id === agentId);
}

/**
 * Combined estimate for the selected agents (AC-7): time is the MAX of the
 * selected agents' known medians (they run in parallel), cost is the SUM.
 * An agent with "no history yet" (sample_size 0 / no estimate yet) is
 * excluded from both — not treated as 0.
 */
export function combinedEstimate(
  estimates: AgentEstimate[] | undefined,
  selectedIds: string[],
): { durationMs: number | null; costUsd: number | null } {
  const known = selectedIds
    .map((id) => estimateFor(estimates, id))
    .filter((e): e is AgentEstimate => !!e && e.sample_size > 0);

  const durations = known.map((e) => e.median_duration_ms).filter((d): d is number => d != null);
  const costs = known.map((e) => e.median_cost_usd).filter((c): c is number => c != null);

  return {
    durationMs: durations.length > 0 ? Math.max(...durations) : null,
    costUsd: costs.length > 0 ? costs.reduce((sum, c) => sum + c, 0) : null,
  };
}
