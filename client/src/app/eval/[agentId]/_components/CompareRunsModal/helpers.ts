/* Pure helpers for the Compare runs modal. */
import type { Agent, AgentVersionConfig } from "@devdigest/shared";

export interface DiffLine {
  type: "same" | "add" | "del";
  text: string;
}

/**
 * Line-level diff (LCS). `del` lines exist only in `a` (old), `add` only in `b`
 * (new). System prompts are short, so the O(n·m) table is fine.
 */
export function diffLines(a: string, b: string): DiffLine[] {
  const x = a.split("\n");
  const y = b.split("\n");
  const n = x.length;
  const m = y.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = x[i] === y[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      out.push({ type: "same", text: x[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ type: "del", text: x[i++]! });
    } else {
      out.push({ type: "add", text: y[j++]! });
    }
  }
  while (i < n) out.push({ type: "del", text: x[i++]! });
  while (j < m) out.push({ type: "add", text: y[j++]! });
  return out;
}

const norm = (v: unknown) => JSON.stringify(v ?? null);

/** True when applying `snapshot` would change nothing (Promote is then hidden). */
export function snapshotEqualsAgent(
  snapshot: AgentVersionConfig,
  agent: Pick<Agent, "provider" | "model" | "system_prompt" | "output_schema" | "strategy" | "ci_fail_on" | "repo_intel">,
  skillIds: string[],
): boolean {
  return (
    snapshot.provider === agent.provider &&
    snapshot.model === agent.model &&
    snapshot.system_prompt === agent.system_prompt &&
    norm(snapshot.output_schema) === norm(agent.output_schema) &&
    snapshot.strategy === agent.strategy &&
    snapshot.ci_fail_on === agent.ci_fail_on &&
    snapshot.repo_intel === agent.repo_intel &&
    norm(snapshot.skills) === norm(skillIds)
  );
}
