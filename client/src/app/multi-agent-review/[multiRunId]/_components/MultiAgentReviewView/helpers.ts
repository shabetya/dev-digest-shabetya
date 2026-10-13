import type { AgentColumn, Conflict } from "@devdigest/shared";

/** Pure helpers for the Multi-Agent Review results page — no hooks, directly
   unit-testable. Status-ring colour is derived from `score` wherever it's
   rendered (CircularScore does this internally); nothing here stores it. */

/** Every selected agent agreeing at a location means every take has the same
   verdict (including every agent having `'ignored'` — "none of them flagged
   this" is still agreement). */
export function allAgree(conflict: Conflict): boolean {
  const verdicts = new Set(conflict.takes.map((t) => t.verdict));
  return verdicts.size <= 1;
}

/** AC-18: "Show only conflicts" hides locations where every agent agrees. */
export function visibleConflicts(conflicts: Conflict[], showOnlyConflicts: boolean): Conflict[] {
  return showOnlyConflicts ? conflicts.filter((c) => !allAgree(c)) : conflicts;
}

/** The column to default the Tabs view to: the first one, or null when
   there are none yet (still loading). */
export function defaultColumn(columns: AgentColumn[]): AgentColumn | null {
  return columns[0] ?? null;
}

export function findColumn(columns: AgentColumn[], agentId: string | null): AgentColumn | null {
  if (!agentId) return null;
  return columns.find((c) => c.agent_id === agentId) ?? null;
}
