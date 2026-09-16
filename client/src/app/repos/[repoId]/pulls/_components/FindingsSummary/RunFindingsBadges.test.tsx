import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { FindingRecord } from "@devdigest/shared";
import { RunFindingsBadges } from "./RunFindingsBadges";

afterEach(cleanup);

function finding(o: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "perf",
    title: "N+1 query in user list endpoint",
    file: "src/api/users.ts",
    start_line: 45,
    end_line: 52,
    rationale: "The loop calls db.posts.findMany once per user.",
    confidence: 0.86,
    review_id: "review-1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

describe("RunFindingsBadges", () => {
  it("derives severity counts from the passed-in findings", () => {
    render(<RunFindingsBadges findings={[finding({ severity: "WARNING" })]} />);
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("clicking the badges opens a popover listing the findings (no fetch — data already in memory)", () => {
    render(
      <RunFindingsBadges
        findings={[finding({ title: "N+1 query in user list endpoint" })]}
      />,
    );
    fireEvent.click(screen.getByText("1"));
    expect(screen.getByText("N+1 query in user list endpoint")).toBeInTheDocument();
    expect(screen.getByText(/1 finding in this run/i)).toBeInTheDocument();
  });
});
