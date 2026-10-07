/** Known machine reasons on a failed suite (`reason`); anything else falls back to the generic text. */
const SUITE_REASONS = ["llm_unavailable", "stale"] as const;
export type SuiteReasonKey = (typeof SUITE_REASONS)[number] | "generic";

export function suiteReasonKey(reason: string | null | undefined): SuiteReasonKey {
  return (SUITE_REASONS as readonly string[]).includes(reason ?? "") ? (reason as SuiteReasonKey) : "generic";
}
