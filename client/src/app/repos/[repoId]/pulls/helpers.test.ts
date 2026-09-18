import { describe, it, expect } from "vitest";
import { filterAndSortPulls, relativeTime, sizeOf } from "./helpers";
import type { PrMeta } from "./constants";

function pr(overrides: Partial<PrMeta> & Pick<PrMeta, "number" | "title" | "status">): PrMeta {
  return {
    id: overrides.number.toString(),
    author: "octocat",
    branch: "feature",
    base: "main",
    head_sha: "abc123",
    additions: 1,
    deletions: 0,
    files_count: 1,
    opened_at: null,
    updated_at: null,
    score: null,
    cost_usd: null,
    findings: null,
    ...overrides,
  };
}

describe("filterAndSortPulls", () => {
  const pulls: PrMeta[] = [
    pr({ number: 1, title: "Fix login bug", status: "needs_review", updated_at: "2026-01-01T00:00:00Z" }),
    pr({ number: 2, title: "Add dark mode", status: "reviewed", updated_at: "2026-01-03T00:00:00Z" }),
    pr({ number: 3, title: "Refactor auth", status: "needs_review", updated_at: "2026-01-02T00:00:00Z" }),
  ];

  it("filters by status, 'all' passing everything through", () => {
    expect(filterAndSortPulls(pulls, { status: "needs_review", query: "", sort: "newest" }).map((p) => p.number)).toEqual([
      3, 1,
    ]);
    expect(filterAndSortPulls(pulls, { status: "all", query: "", sort: "newest" })).toHaveLength(3);
  });

  it("filters by free-text query against title or PR number, case-insensitively", () => {
    expect(filterAndSortPulls(pulls, { status: "all", query: "DARK", sort: "newest" }).map((p) => p.number)).toEqual([2]);
    expect(filterAndSortPulls(pulls, { status: "all", query: "3", sort: "newest" }).map((p) => p.number)).toEqual([3]);
  });

  it("sorts newest-first by default and oldest-first when asked", () => {
    expect(filterAndSortPulls(pulls, { status: "all", query: "", sort: "newest" }).map((p) => p.number)).toEqual([
      2, 3, 1,
    ]);
    expect(filterAndSortPulls(pulls, { status: "all", query: "", sort: "oldest" }).map((p) => p.number)).toEqual([
      1, 3, 2,
    ]);
  });

  it("treats a missing/unparseable updated_at as epoch 0 rather than throwing", () => {
    const withMissing = [...pulls, pr({ number: 4, title: "No timestamp", status: "reviewed", updated_at: null })];
    const result = filterAndSortPulls(withMissing, { status: "all", query: "", sort: "newest" });
    expect(result.at(-1)?.number).toBe(4);
  });

  it("does not mutate the input array", () => {
    const copy = [...pulls];
    filterAndSortPulls(pulls, { status: "all", query: "", sort: "oldest" });
    expect(pulls).toEqual(copy);
  });
});

describe("sizeOf / relativeTime (existing coverage, unaffected by the refactor)", () => {
  it("buckets by changed lines", () => {
    expect(sizeOf(pr({ number: 1, title: "x", status: "open", additions: 10, deletions: 5 })).size).toBe("S");
  });

  it("formats a recent timestamp as minutes", () => {
    expect(relativeTime(new Date().toISOString())).toBe("now");
  });
});
