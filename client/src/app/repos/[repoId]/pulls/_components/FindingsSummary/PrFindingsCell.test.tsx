import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { PrMeta, ReviewRecord, FindingRecord } from "@devdigest/shared";

// PrFindingsCell fetches lazily via usePrReviews once the popover opens —
// mocked here so this stays a pure component test (see RunStatus.test.tsx
// for the same pattern elsewhere in this app).
const usePrReviews = vi.fn();
vi.mock("../../../../../../lib/hooks/reviews", () => ({
  usePrReviews: (...args: unknown[]) => usePrReviews(...args),
}));

import { PrFindingsCell } from "./PrFindingsCell";

afterEach(cleanup);

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    id: "pr-1",
    number: 482,
    title: "t",
    author: "a",
    branch: "b",
    base: "main",
    head_sha: "sha",
    additions: 1,
    deletions: 0,
    files_count: 1,
    status: "needs_review",
    score: null,
    cost_usd: null,
    findings: null,
    ...o,
  };
}

function finding(o: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 12,
    end_line: 12,
    rationale: "A live key is committed.",
    confidence: 0.9,
    review_id: "review-1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

describe("PrFindingsCell", () => {
  it("does not call usePrReviews with an id until the popover is opened", () => {
    usePrReviews.mockReturnValue({ data: undefined, isLoading: false });
    render(<PrFindingsCell pr={pr({ findings: { CRITICAL: 1, WARNING: 0, SUGGESTION: 0 } })} />);
    expect(usePrReviews).toHaveBeenCalledWith(null);
  });

  it("renders badges without a popover when the PR has never been reviewed", () => {
    usePrReviews.mockReturnValue({ data: undefined, isLoading: false });
    render(<PrFindingsCell pr={pr({ findings: null })} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(usePrReviews).toHaveBeenCalledWith(null);
  });

  it("fetches and shows the latest review's findings once clicked", () => {
    const review: Partial<ReviewRecord> = { findings: [finding()] };
    usePrReviews.mockReturnValue({ data: [review], isLoading: false });
    render(<PrFindingsCell pr={pr({ findings: { CRITICAL: 1, WARNING: 0, SUGGESTION: 0 } })} />);

    fireEvent.click(screen.getByText("1"));
    expect(usePrReviews).toHaveBeenCalledWith("pr-1");
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });
});
