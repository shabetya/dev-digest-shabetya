import type { Severity } from "@devdigest/shared";

export type SeverityCounts = { CRITICAL: number; WARNING: number; SUGGESTION: number };

/** Display order for severity badges — worst first. */
export const SEVERITY_ORDER: Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];

/** Reduce a findings array into per-severity counts (unknown severities are ignored). */
export function countBySeverity(findings: { severity: string }[]): SeverityCounts {
  const counts: SeverityCounts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) {
    if (f.severity === "CRITICAL" || f.severity === "WARNING" || f.severity === "SUGGESTION") {
      counts[f.severity] += 1;
    }
  }
  return counts;
}

/** Format a finding's line range ("11" when single-line, else "11-15"). */
export function lineLabel(f: { start_line: number; end_line: number }): string {
  return f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
}
