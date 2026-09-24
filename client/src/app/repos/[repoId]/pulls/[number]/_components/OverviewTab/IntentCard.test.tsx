import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { PrIntentRecord } from "@devdigest/shared";

const mutateMock = vi.fn();
let intentData: PrIntentRecord | null = null;

vi.mock("../../../../../../../lib/hooks/intent", () => ({
  usePrIntent: () => ({ data: intentData, isLoading: false }),
  useExtractIntent: () => ({ mutate: mutateMock, isPending: false }),
}));

import { IntentCard } from "./IntentCard";

afterEach(() => {
  cleanup();
  intentData = null;
  mutateMock.mockClear();
});

function record(overrides: Partial<PrIntentRecord> = {}): PrIntentRecord {
  return {
    pr_id: "pr-1",
    summary: "Adds rate limiting to public endpoints.",
    in_scope: ["src/config.ts"],
    out_of_scope: ["unrelated admin panel"],
    confidence: 0.9,
    low_confidence: false,
    sources: ["pr_title", "file_hunks"],
    plan_link_url: null,
    plan_link_status: "not_linked",
    model: "deepseek/deepseek-v4-flash",
    computed_for_sha: "a1b2c3d4",
    computed_at: "2026-06-01T00:00:00Z",
    ...overrides,
  };
}

describe("IntentCard", () => {
  it("shows the empty state before any Intent is computed, and Re-evaluate triggers extraction", () => {
    intentData = null;
    render(<IntentCard prId="pr-1" />);

    expect(screen.getByText(/No intent computed yet/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /re-evaluate/i }));
    expect(mutateMock).toHaveBeenCalledWith("pr-1");
  });

  it("renders the summary, in/out-of-scope lists, and low-confidence + inaccessible-link indicators", () => {
    intentData = record({
      low_confidence: true,
      confidence: 0.2,
      plan_link_status: "inaccessible",
      plan_link_url: "https://example.com/plan",
    });
    render(<IntentCard prId="pr-1" />);

    expect(screen.getByText("Adds rate limiting to public endpoints.")).toBeInTheDocument();
    expect(screen.getByText("src/config.ts")).toBeInTheDocument();
    expect(screen.getByText("unrelated admin panel")).toBeInTheDocument();
    expect(screen.getByText(/low confidence/i)).toBeInTheDocument();
    expect(screen.getByText(/plan link inaccessible/i)).toBeInTheDocument();
  });

  it("does not show the low-confidence or inaccessible-link badges when not applicable", () => {
    intentData = record({ low_confidence: false, plan_link_status: "not_linked" });
    render(<IntentCard prId="pr-1" />);

    expect(screen.queryByText(/low confidence/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/plan link inaccessible/i)).not.toBeInTheDocument();
  });
});
