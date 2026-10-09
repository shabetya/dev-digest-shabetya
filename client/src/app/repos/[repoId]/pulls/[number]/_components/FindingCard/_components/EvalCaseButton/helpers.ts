import { ApiError } from "@/lib/api";

/** Server reasons that have their own message (`prReview.evalCase.errors.<code>`). */
const KNOWN_REASONS = ["finding_undecided", "no_agent", "diff_unavailable", "diff_too_large"] as const;
export type EvalCaseErrorKey = (typeof KNOWN_REASONS)[number] | "generic";

/** Map a failed turn-into-case call to a translation key (reason-specific, else generic). */
export function evalCaseErrorKey(err: unknown): EvalCaseErrorKey {
  const code = err instanceof ApiError ? err.code : undefined;
  return (KNOWN_REASONS as readonly string[]).includes(code ?? "") ? (code as EvalCaseErrorKey) : "generic";
}

/** A case can only be derived from a decided (accepted or dismissed) finding. */
export function isDecided(f: { accepted_at?: string | null; dismissed_at?: string | null }): boolean {
  return !!f.accepted_at || !!f.dismissed_at;
}
