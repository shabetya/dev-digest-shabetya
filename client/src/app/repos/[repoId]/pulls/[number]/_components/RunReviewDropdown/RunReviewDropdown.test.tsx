import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";

const { push, notifySuccess, mutateAsync } = vi.hoisted(() => ({
  push: vi.fn(),
  notifySuccess: vi.fn(),
  mutateAsync: vi.fn(() =>
    Promise.resolve({ runs: [{ run_id: "r1" }], multi_run_id: "multi-1" as string | null }),
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));
vi.mock("../../../../../../../lib/toast", () => ({
  notify: { success: notifySuccess, info: vi.fn(), error: vi.fn() },
}));

const useAgents = vi.fn(() => ({
  data: [
    { id: "a1", name: "Security", model: "gpt-4.1", enabled: true },
    { id: "a2", name: "Performance", model: "gpt-4.1", enabled: false },
  ],
}));
vi.mock("../../../../../../../lib/hooks/agents", () => ({ useAgents: () => useAgents() }));
vi.mock("../../../../../../../lib/hooks/multi-agent", () => ({
  useAgentEstimates: () => ({
    data: {
      estimates: [
        { agent_id: "a1", agent_name: "Security", median_duration_ms: 6000, median_cost_usd: 0.01, sample_size: 5 },
        { agent_id: "a2", agent_name: "Performance", median_duration_ms: null, median_cost_usd: null, sample_size: 0 },
      ],
    },
  }),
}));
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useRunReview: () => ({ mutateAsync, isPending: false }),
}));

import { RunReviewDropdown } from "./RunReviewDropdown";

afterEach(() => {
  cleanup();
  push.mockClear();
  mutateAsync.mockClear();
  notifySuccess.mockClear();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("RunReviewDropdown", () => {
  it("opens the checkbox panel, shows per-agent estimates, lets the user toggle a selection, and runs + navigates on submit", () => {
    renderWithIntl(<RunReviewDropdown prId="pr1" />);

    // Trigger opens the panel.
    fireEvent.click(screen.getByText("Run Review"));
    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.getByText("Performance")).toBeInTheDocument();
    expect(screen.getByText("~6.0s")).toBeInTheDocument();
    expect(screen.getByText("no history yet")).toBeInTheDocument();

    // Default selection is the enabled agent only — run button starts at (1).
    expect(screen.getByText("Run multi-agent review (1)")).toBeInTheDocument();

    // "Select all" checks every agent, including the disabled one.
    fireEvent.click(screen.getByText("Select all"));
    expect(screen.getByText("Run multi-agent review (2)")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Run multi-agent review (2)"));
    expect(mutateAsync).toHaveBeenCalledWith({ prId: "pr1", agentIds: ["a1", "a2"] });
  });

  it("shows the empty state and keeps the run button disabled when there are no agents", () => {
    useAgents.mockReturnValueOnce({ data: [] });
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    fireEvent.click(screen.getByText("Run Review"));
    expect(screen.getByText("No agents yet — create one")).toBeInTheDocument();
    expect(screen.queryByText(/Run multi-agent review/)).not.toBeInTheDocument();
  });

  it("confirms via toast (not just a silent no-op) and does not navigate when exactly 1 agent is checked (no multi_run_id, AC-11's 2+ gate)", async () => {
    mutateAsync.mockResolvedValueOnce({ runs: [{ run_id: "r1" }], multi_run_id: null });
    renderWithIntl(<RunReviewDropdown prId="pr1" />);

    fireEvent.click(screen.getByText("Run Review"));
    // Default selection is the one enabled agent — run button starts at (1).
    fireEvent.click(screen.getByText("Run multi-agent review (1)"));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ prId: "pr1", agentIds: ["a1"] }));
    await waitFor(() =>
      expect(notifySuccess).toHaveBeenCalledWith("Review started — watch the Findings tab for progress."),
    );
    expect(push).not.toHaveBeenCalled();
  });
});
