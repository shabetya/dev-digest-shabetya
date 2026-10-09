/* Pure helpers for the /eval routes. */
import type { EvalAgentDashboardRow, EvalSuiteRun } from "@devdigest/shared";
import { EVAL_RUN_ALL_CONFIRM_CASES } from "./constants";

export interface RunAllPlan {
  /** Agents with at least one case — one suite each. */
  agentIds: string[];
  /** Agents skipped for having no cases (shown as "no cases"). */
  noCases: string[];
  totalCases: number;
  needsConfirm: boolean;
}

export function planRunAll(rows: Pick<EvalAgentDashboardRow, "agent_id" | "agent_name" | "cases_total">[]): RunAllPlan {
  const withCases = rows.filter((r) => r.cases_total > 0);
  const totalCases = withCases.reduce((n, r) => n + r.cases_total, 0);
  return {
    agentIds: withCases.map((r) => r.agent_id),
    noCases: rows.filter((r) => r.cases_total === 0).map((r) => r.agent_name),
    totalCases,
    needsConfirm: totalCases > EVAL_RUN_ALL_CONFIRM_CASES,
  };
}

/** Two selected run ids → [older, newer] by `ran_at` (so deltas read old → new). */
export function orderPair(runs: Pick<EvalSuiteRun, "id" | "ran_at">[], ids: string[]): [string, string] | null {
  if (ids.length !== 2) return null;
  const at = (id: string) => new Date(runs.find((r) => r.id === id)?.ran_at ?? 0).getTime();
  const [a, b] = ids as [string, string];
  return at(a) <= at(b) ? [a, b] : [b, a];
}

/** Toggle a run in the selection, never exceeding `max`. */
export function toggleSelection(selected: string[], id: string, max: number): string[] {
  if (selected.includes(id)) return selected.filter((x) => x !== id);
  return selected.length >= max ? selected : [...selected, id];
}
