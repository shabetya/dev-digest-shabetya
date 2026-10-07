/* Pure helpers for the Evals tab (no hooks, no React). */
import type { EvalCaseSummary } from "@devdigest/shared";

/** Cases whose last run passed. */
export function countPassing(cases: Pick<EvalCaseSummary, "last_run">[]): number {
  return cases.filter((c) => c.last_run.status === "passed").length;
}

/** Cases the suite can actually run (invalid stored rows are excluded server-side). */
export function runnableCount(cases: Pick<EvalCaseSummary, "invalid">[]): number {
  return cases.filter((c) => !c.invalid).length;
}

export type CaseChip = { kind: "empty" } | { kind: "label"; text: string };

/** "severity · category" of the first expected item, `empty []` for an empty list. */
export function caseChip(c: Pick<EvalCaseSummary, "expected_output" | "expectation" | "invalid">): CaseChip | null {
  if (c.invalid || !Array.isArray(c.expected_output)) return null;
  if (c.expected_output.length === 0) return { kind: "empty" };
  const first = c.expected_output[0] as { severity?: string | null; category?: string | null } | null;
  const parts = [first?.severity, first?.category].filter((p): p is string => !!p);
  return { kind: "label", text: parts.length ? parts.join(" · ") : c.expectation };
}
