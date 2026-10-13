import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import type { Agent, CiInstallation, CiRun } from "@devdigest/shared";
import { renderWithProviders, stubFetch } from "@/test/ci-utils";

// AgentEditor smoke-tests mock this same hooks module; mirror that so CiTab
// renders without a real update-agent network call.
vi.mock("@/lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { CiTab } from "./CiTab";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "p",
  output_schema: null,
  enabled: true,
  version: 1,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
};

const INSTALLATION: CiInstallation = {
  id: "i1",
  agent_id: "ag1",
  repo: "acme/payments-api",
  target_type: "gha",
  installed_at: "2026-06-01T00:00:00.000Z",
};

const RUN: CiRun = {
  id: "r1",
  ci_installation_id: "i1",
  pr_number: 42,
  ran_at: "2026-06-02T00:00:00.000Z",
  status: "succeeded",
  findings_count: 0,
  cost_usd: 0.01,
  github_url: "https://github.com/acme/payments-api/actions/runs/1",
  source: "gha",
  agent: "Security Reviewer",
  duration_s: null,
};

describe("CiTab", () => {
  it("shows the empty state and opens the Export Wizard from '+ Add to CI'", async () => {
    stubFetch({ "GET /agents/ag1/ci": { installations: [], runs: [] } });
    renderWithProviders(<CiTab agent={AGENT} />);

    expect(await screen.findByText("Not deployed to CI yet. Use “+ Add to CI” to open a PR that adds the workflow + agent config.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "+ Add to CI" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("shows the active-repos badge and installed row with target badge + last-run info", async () => {
    stubFetch({ "GET /agents/ag1/ci": { installations: [INSTALLATION], runs: [RUN] } });
    renderWithProviders(<CiTab agent={AGENT} />);

    expect(await screen.findByText("Active in 1 repos")).toBeInTheDocument();
    expect(screen.getByText("acme/payments-api")).toBeInTheDocument();
    expect(screen.getByText("gha")).toBeInTheDocument();
  });

  it("Refresh pulls new CI runs for this agent", async () => {
    stubFetch({ "GET /agents/ag1/ci": { installations: [INSTALLATION], runs: [] } });
    renderWithProviders(<CiTab agent={AGENT} />);
    await screen.findByText("acme/payments-api");

    const calls = stubFetch({
      "GET /agents/ag1/ci": { installations: [INSTALLATION], runs: [RUN] },
      "POST /agents/ag1/ci/refresh": { ingested: 1, rejected: 0 },
    });
    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
    await waitFor(() =>
      expect(calls.some((c) => c.method === "POST" && c.path === "/agents/ag1/ci/refresh")).toBe(true),
    );
  });
});
