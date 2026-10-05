import type { PrBrief } from "@devdigest/shared";

/** 8200 → "8.2K"; below 1000 stays as-is. */
export function formatTokenCount(n: number): string {
  return n < 1000 ? String(n) : `${(n / 1000).toFixed(1)}K`;
}

/** The usage line is hidden when the provider reported nothing (0 tokens and no/zero cost). */
export function hasUsage(usage: PrBrief["usage"]): usage is NonNullable<PrBrief["usage"]> {
  if (!usage) return false;
  return usage.prompt_tokens > 0 || usage.completion_tokens > 0 || (usage.cost_usd ?? 0) > 0;
}

/** A brief is stale when it was generated for a different head commit than the PR's current one. */
export function isStaleBrief(brief: Pick<PrBrief, "generated_for_sha">, headSha: string | null | undefined): boolean {
  return !!headSha && brief.generated_for_sha !== headSha;
}
