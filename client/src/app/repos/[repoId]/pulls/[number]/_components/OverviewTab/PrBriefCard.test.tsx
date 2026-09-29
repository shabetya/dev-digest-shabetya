import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrBrief, ReviewRecord } from "@devdigest/shared";
import briefMessages from "../../../../../../../../messages/en/brief.json";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";
import { ApiError } from "@/lib/api";

const mutate = vi.fn();
let briefData: PrBrief | null | undefined = null;
let briefLoading = false;
let mutation: { isPending: boolean; isError: boolean; error: unknown } = {
  isPending: false,
  isError: false,
  error: null,
};
let reviewsData: ReviewRecord[] = [];

vi.mock("@/lib/hooks/brief", async () => {
  const actual = await vi.importActual<typeof import("@/lib/hooks/brief")>("@/lib/hooks/brief");
  return {
    ...actual,
    useBrief: () => ({ data: briefData, isLoading: briefLoading, isError: false }),
    useGenerateBrief: () => ({ mutate, ...mutation }),
  };
});
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: reviewsData }),
}));

import { PrBriefCard } from "./PrBriefCard";

afterEach(() => {
  cleanup();
  briefData = null;
  briefLoading = false;
  mutation = { isPending: false, isError: false, error: null };
  reviewsData = [];
  mutate.mockClear();
});

const BRIEF: PrBrief = {
  summary: "Reworks the payment flow to retry failed charges.",
  risks: [
    { title: "Double charge", explanation: "Retry may repeat a capture.", severity: "high", file_refs: ["src/pay.ts"] },
    { title: "Slow path", explanation: "", severity: "low", file_refs: [] },
  ],
  review_focus: [
    { file: "src/pay.ts", line: 42, reason: "retry loop" },
    { file: "src/db.ts", line: 7, reason: "new column" },
  ],
  missing: ["intent", "specs"],
  generated_at: "2026-01-01T00:00:00Z",
  generated_for_sha: "abc123",
  model: "gpt-4.1",
  usage: { prompt_tokens: 8200, completion_tokens: 1300, cost_usd: 0.0138 },
};

function review(): ReviewRecord {
  return {
    id: "r1",
    pr_id: "pr1",
    agent_id: null,
    run_id: null,
    agent_name: "Security agent",
    kind: "review",
    verdict: "request_changes",
    summary: "review summary that must NOT be shown",
    score: 61,
    model: "m",
    created_at: "2026-01-01T00:00:00Z",
    findings: [
      {
        id: "f1",
        severity: "CRITICAL",
        category: "security",
        title: "t",
        file: "src/pay.ts",
        start_line: 1,
        end_line: 1,
        rationale: "r",
        suggestion: null,
        confidence: 0.9,
        kind: "finding",
        trifecta_components: null,
        evidence: null,
        review_id: "r1",
        accepted_at: null,
        dismissed_at: null,
      },
    ],
  } as ReviewRecord;
}

function renderCard(onOpenFile = vi.fn(), headSha = "abc123") {
  render(
    <NextIntlClientProvider locale="en" messages={{ brief: briefMessages, prReview: prReviewMessages }}>
      <PrBriefCard prId="pr1" headSha={headSha} onOpenFile={onOpenFile} />
    </NextIntlClientProvider>,
  );
  return onOpenFile;
}

describe("PrBriefCard", () => {
  it("empty state offers a single Generate button and never auto-generates", () => {
    renderCard();
    expect(screen.getByText(/No brief yet/)).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Generate brief" }));
    expect(mutate).toHaveBeenCalledWith("pr1");
  });

  it("renders summary, risks with severity text, ordered focus list, usage and missing notes; clicks open files", () => {
    briefData = BRIEF;
    const onOpenFile = renderCard();

    expect(screen.getByText(BRIEF.summary)).toBeInTheDocument();
    expect(screen.getByText("Risk areas")).toBeInTheDocument();
    expect(screen.getByText("High severity")).toBeInTheDocument();
    expect(screen.getByText("Low severity")).toBeInTheDocument();
    expect(screen.getByText("Double charge")).toBeInTheDocument();

    // ordered focus list, file:line — reason, in model order
    const items = screen.getAllByRole("listitem").filter((li) => li.closest("ol"));
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("src/pay.ts:42 — retry loop");
    expect(items[1]).toHaveTextContent("src/db.ts:7 — new column");

    expect(screen.getByText("$0.014 · 8.2K→1.3K")).toBeInTheDocument();
    expect(screen.getByText(/Intent \(not computed yet\)/)).toBeInTheDocument();
    expect(screen.getByText(/Attached project specs/)).toBeInTheDocument();
    expect(screen.queryByText(/earlier commit/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Blast radius \(not computed/)).not.toBeInTheDocument();

    fireEvent.click(within(items[1]!).getByRole("button", { name: "src/db.ts:7" }));
    expect(onOpenFile).toHaveBeenLastCalledWith("src/db.ts", 7);
    fireEvent.click(screen.getByRole("button", { name: "src/pay.ts" }));
    expect(onOpenFile).toHaveBeenLastCalledWith("src/pay.ts");
  });

  it("shows noRisks, hides empty usage, and flags a stale brief", () => {
    briefData = {
      ...BRIEF,
      risks: [],
      review_focus: [],
      missing: [],
      usage: { prompt_tokens: 0, completion_tokens: 0, cost_usd: null },
    };
    renderCard(vi.fn(), "newer-sha");
    expect(screen.getByText("No notable risks flagged.")).toBeInTheDocument();
    expect(screen.getByText(/generated for an earlier commit/)).toBeInTheDocument();
    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
    expect(screen.queryByText("Review focus")).not.toBeInTheDocument();
  });

  it("uses the VerdictBanner with the brief summary when a review exists", () => {
    briefData = BRIEF;
    reviewsData = [review()];
    renderCard();
    expect(screen.getByText(BRIEF.summary)).toBeInTheDocument();
    expect(screen.queryByText(/must NOT be shown/)).not.toBeInTheDocument();
    expect(screen.getByText("Security agent")).toBeInTheDocument();
    expect(screen.getByText("61")).toBeInTheDocument();
  });

  it("while pending disables Refresh with aria-busy; on failure keeps the previous brief and announces the reason", () => {
    briefData = BRIEF;
    mutation = { isPending: true, isError: false, error: null };
    renderCard();
    const busy = screen.getByRole("button", { name: /Refreshing/ });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    cleanup();

    mutation = {
      isPending: false,
      isError: true,
      error: new ApiError("x", 409, "conflict", { reason: "generation_in_progress" }),
    };
    renderCard();
    expect(screen.getByText(/already being generated/)).toBeInTheDocument();
    expect(screen.getByText(BRIEF.summary)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled();
  });
});
