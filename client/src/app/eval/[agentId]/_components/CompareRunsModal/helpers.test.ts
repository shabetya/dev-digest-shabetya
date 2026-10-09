import { describe, it, expect } from "vitest";
import { diffLines, snapshotEqualsAgent } from "./helpers";

describe("compare helpers", () => {
  it("diffs prompts line by line (removed from old, added in new)", () => {
    const out = diffLines("keep\nold line\nend", "keep\nnew line\nend");
    expect(out).toEqual([
      { type: "same", text: "keep" },
      { type: "del", text: "old line" },
      { type: "add", text: "new line" },
      { type: "same", text: "end" },
    ]);
    expect(diffLines("a", "a").every((l) => l.type === "same")).toBe(true);
  });

  it("treats a snapshot equal to the live agent only when every field and the skill order match", () => {
    const agent = {
      provider: "openai" as const,
      model: "gpt-4.1",
      system_prompt: "p",
      output_schema: null,
      strategy: "single-pass" as const,
      ci_fail_on: "critical" as const,
      repo_intel: true,
    };
    const snap = { ...agent, skills: ["s1", "s2"] };
    expect(snapshotEqualsAgent(snap, agent, ["s1", "s2"])).toBe(true);
    expect(snapshotEqualsAgent(snap, agent, ["s2", "s1"])).toBe(false);
    expect(snapshotEqualsAgent({ ...snap, system_prompt: "q" }, agent, ["s1", "s2"])).toBe(false);
  });
});
