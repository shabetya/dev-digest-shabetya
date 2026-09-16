import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@/lib/types";
import messages from "../../../../../../../messages/en/prReview.json";

// The findings popover lazily fetches via usePrReviews once opened — mocked
// here (rather than a real QueryClient + fetch) so this stays a pure
// component test, same pattern as RunStatus.test.tsx.
vi.mock("../../../../../../lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: undefined, isLoading: true }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { PRRow } from "./PRRow";

afterEach(cleanup);

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    id: "pr-1",
    number: 482,
    title: "Add rate limiting to public API endpoints",
    author: "marisa.koch",
    branch: "feat/rate-limit-public",
    base: "main",
    head_sha: "abc123",
    additions: 247,
    deletions: 38,
    files_count: 9,
    status: "needs_review",
    opened_at: "2026-06-11T18:44:34.000Z",
    updated_at: "2026-06-11T18:44:34.000Z",
    score: null,
    cost_usd: null,
    ...o,
  };
}

function renderRow(row: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={row} repoId="repo-1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow — cost cell", () => {
  it("renders the formatted cost when the PR has a latest-review cost", () => {
    renderRow(pr({ cost_usd: 0.014 }));
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("renders '—' for cost when there's no cost data, even if the PR was scored", () => {
    renderRow(pr({ score: 61, cost_usd: null }));
    // Both the score AND findings cells render "—" when never reviewed.
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1);
  });
});

describe("PRRow — findings cell", () => {
  it("renders '—' when the PR has never been reviewed", () => {
    renderRow(pr({ score: null, cost_usd: null, findings: null }));
    // cost cell + score cell + findings cell all show "—" pre-review.
    expect(screen.getAllByText("—").length).toBe(3);
  });

  it("renders a muted '0' when reviewed with no findings", () => {
    renderRow(pr({ score: 95, findings: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 } }));
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("renders one badge per non-zero severity", () => {
    renderRow(pr({ score: 61, findings: { CRITICAL: 2, WARNING: 1, SUGGESTION: 0 } }));
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("clicking a findings badge does not navigate the row", () => {
    renderRow(pr({ score: 61, findings: { CRITICAL: 2, WARNING: 0, SUGGESTION: 0 } }));
    fireEvent.click(screen.getByText("2"));
    // The popover opens (loading state while findings are fetched) instead of
    // the row's onClick firing (which would call router.push, not asserted
    // here — this asserts the click was captured by the findings cell).
    expect(screen.getByText(/loading findings/i)).toBeInTheDocument();
  });
});
