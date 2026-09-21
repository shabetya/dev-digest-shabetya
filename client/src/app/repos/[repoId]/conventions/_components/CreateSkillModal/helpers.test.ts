import { describe, it, expect } from "vitest";
import type { ConventionCandidate } from "@devdigest/shared";
import { buildSkillBodyFromConventions, defaultSkillName, repoLabelFor } from "./helpers";

function candidate(overrides: Partial<ConventionCandidate>): ConventionCandidate {
  return {
    id: "c1",
    category: "async-await",
    rule: "Always use async/await instead of .then() chains",
    evidence_path: "src/api/users.ts",
    evidence_line_start: 23,
    evidence_line_end: 31,
    evidence_snippet: "const user = await db.users.find(id);",
    confidence: 0.91,
    status: "accepted",
    ...overrides,
  };
}

describe("repoLabelFor / defaultSkillName", () => {
  it("derives the short repo label and skill name from a full_name", () => {
    expect(repoLabelFor("acme/payments-api")).toBe("payments-api");
    expect(defaultSkillName("payments-api")).toBe("payments-api-conventions");
  });
});

describe("buildSkillBodyFromConventions", () => {
  it("groups candidates by category into one heading each, citing file:line", () => {
    const body = buildSkillBodyFromConventions("payments-api", [
      candidate({ id: "c1" }),
      candidate({
        id: "c2",
        category: "redis",
        rule: "Redis access goes through src/lib/redis.ts singleton",
        evidence_path: "src/lib/redis.ts",
        evidence_line_start: 1,
        evidence_line_end: 9,
      }),
    ]);

    expect(body).toContain("# payments-api-conventions");
    expect(body).toContain("## async-await");
    expect(body).toContain("## redis");
    expect(body).toContain("Detected in `src/api/users.ts:23-31`");
    expect(body).toContain("Detected in `src/lib/redis.ts:1-9`");
  });

  it("merges multiple candidates that share a category under one heading", () => {
    const body = buildSkillBodyFromConventions("payments-api", [
      candidate({ id: "c1", rule: "Rule one" }),
      candidate({ id: "c2", rule: "Rule two" }),
    ]);
    const headingCount = body.split("## async-await").length - 1;
    expect(headingCount).toBe(1);
    expect(body).toContain("Rule one");
    expect(body).toContain("Rule two");
  });
});
