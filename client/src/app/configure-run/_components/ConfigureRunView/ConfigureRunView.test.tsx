import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/multiAgentReview.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/hooks", () => ({
  useRepos: () => ({ data: [{ id: "repo1", full_name: "acme/web" }] }),
  usePulls: (repoId: string | null) =>
    repoId
      ? { data: [{ id: "pr1", number: 42, title: "Add rate limiting" }] }
      : { data: undefined },
}));
vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({
    data: [
      { id: "a1", name: "Security", description: "Finds vulns", enabled: true },
      { id: "a2", name: "Performance", description: "Finds slow code", enabled: true },
    ],
  }),
}));
vi.mock("@/lib/hooks/multi-agent", () => ({
  useAgentEstimates: () => ({
    data: {
      estimates: [
        { agent_id: "a1", agent_name: "Security", median_duration_ms: 8200, median_cost_usd: 0.06, sample_size: 4 },
        { agent_id: "a2", agent_name: "Performance", median_duration_ms: 4000, median_cost_usd: 0.03, sample_size: 2 },
      ],
    },
  }),
}));
const mutateAsync = vi.fn(() => Promise.resolve({ runs: [], multi_run_id: "multi-1" }));
vi.mock("@/lib/hooks/reviews", () => ({ useRunReview: () => ({ mutateAsync, isPending: false }) }));

import { ConfigureRunView } from "./ConfigureRunView";

afterEach(() => {
  cleanup();
  push.mockClear();
  mutateAsync.mockClear();
});

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ multiAgentReview: messages }}>
      <ConfigureRunView />
    </NextIntlClientProvider>,
  );
}

describe("ConfigureRunView", () => {
  it("walks repo → PR → agent selection → run, with the combined estimate (max time, sum cost)", () => {
    renderView();

    // Step 1: pick a repo, then a PR.
    fireEvent.change(screen.getByDisplayValue("—", { exact: false }) ?? screen.getAllByRole("combobox")[0]!, {
      target: { value: "repo1" },
    });
    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[1]!, { target: { value: "pr1" } });

    // Step 2: both agent cards are now selectable.
    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.getByText("Performance")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Select all"));
    // Combined estimate: max(8.2s, 4.0s) = 8.2s; sum(0.06, 0.03) = $0.090.
    expect(screen.getByText("≈ 8.2s · $0.090 · parallel fan-out")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Run multi-agent review (2)"));
    expect(mutateAsync).toHaveBeenCalledWith({ prId: "pr1", agentIds: ["a1", "a2"] });
  });
});
