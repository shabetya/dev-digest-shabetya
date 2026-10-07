import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import type { EvalWorkspaceDashboard } from "@devdigest/shared";
import { renderWithProviders, stubFetch, reply, suiteRun, apiError } from "@/test/eval-utils";

vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

import { EvalDashboardView } from "./EvalDashboardView";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const row = (id: string, name: string, cases: number, latest = false) => ({
  agent_id: id,
  agent_name: name,
  provider: "openai" as const,
  model: "gpt-4.1",
  cases_total: cases,
  latest: latest ? suiteRun({ agent_id: id, agent_name: name, agent_version: 7 }) : null,
  sparkline: [],
});

const DASH = (cases: [number, number, number]): EvalWorkspaceDashboard => ({
  agents: [row("a1", "Security Reviewer", cases[0], true), row("a2", "Style Reviewer", cases[1]), row("a3", "Empty Agent", cases[2])],
  recent_runs: [suiteRun({ agent_name: "Security Reviewer" })],
});

describe("EvalDashboardView", () => {
  it("lists agents with last-run info and recent runs, linking each row to its page", async () => {
    stubFetch({ "GET /eval/dashboard": DASH([4, 2, 0]) });
    renderWithProviders(<EvalDashboardView />);
    const link = await screen.findByRole("link", { name: /Security Reviewer/ });
    expect(link).toHaveAttribute("href", "/eval/a1");
    expect(link).toHaveTextContent("v7");
    expect(link).toHaveTextContent("3/4 passed");
    expect(screen.getByText(/2 cases · never run/)).toBeInTheDocument();
    expect(screen.getByText("no cases")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Security Reviewer")).toBeInTheDocument();
  });

  it("Run all agents starts one suite per agent with cases, asks first above the threshold, tolerates a 409", async () => {
    const calls = stubFetch({
      "GET /eval/dashboard": DASH([20, 15, 0]),
      "POST /agents/a1/eval-runs": reply(suiteRun({ status: "running" }), 202),
      "POST /agents/a2/eval-runs": apiError("suite_running", "busy", 409),
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderWithProviders(<EvalDashboardView />);
    const btn = await screen.findByRole("button", { name: /run all agents/i });
    await waitFor(() => expect(btn).toBeEnabled());
    fireEvent.click(btn); // 35 cases > 30 → confirm → declined
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
    fireEvent.click(btn); // accepted
    expect(await screen.findByText(/Started 1 run; 1 already running; 0 failed/)).toBeInTheDocument();
    const posts = calls.filter((c) => c.method === "POST").map((c) => c.path);
    expect(posts.sort()).toEqual(["/agents/a1/eval-runs", "/agents/a2/eval-runs"]);
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/No cases \(skipped\): Empty Agent/)).toBeInTheDocument();
  });
});
