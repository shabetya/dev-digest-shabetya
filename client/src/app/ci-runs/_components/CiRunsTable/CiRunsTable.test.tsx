import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import type { CiRun } from "@devdigest/shared";
import { renderWithProviders, stubFetch } from "@/test/ci-utils";

vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

import { CiRunsTable } from "./CiRunsTable";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const RUN: CiRun = {
  id: "r1",
  ci_installation_id: "i1",
  pr_number: 42,
  ran_at: "2026-06-01T00:00:00.000Z",
  status: "failed",
  findings_count: 2,
  cost_usd: 0.03,
  github_url: "https://github.com/acme/payments-api/actions/runs/999",
  source: "gha",
  agent: "Security Reviewer",
  duration_s: 64,
};

describe("CiRunsTable", () => {
  it("lists CI runs with repository (derived from the GH Actions URL), PR number, agent, status, cost, duration, and a job link", async () => {
    stubFetch({ "GET /ci-runs": [RUN] });
    renderWithProviders(<CiRunsTable />);

    expect(await screen.findByText(/acme\/payments-api #42/)).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByText(/Security Reviewer/)).toBeInTheDocument();
    expect(within(table).getByText("Failed")).toBeInTheDocument();
    expect(within(table).getByText("$0.03")).toBeInTheDocument();
    // Fix B (AC-17): 64s formats as "1m 4s".
    expect(within(table).getByText("1m 4s")).toBeInTheDocument();
    expect(within(table).getByRole("link", { name: "View" })).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/actions/runs/999",
    );
  });

  it("renders the — placeholder when a run has no duration yet", async () => {
    stubFetch({ "GET /ci-runs": [{ ...RUN, duration_s: null }] });
    renderWithProviders(<CiRunsTable />);
    await screen.findByText(/acme\/payments-api #42/);
    const table = screen.getByRole("table");
    const durationHeaderIndex = within(table)
      .getAllByRole("columnheader")
      .findIndex((th) => th.textContent === "Duration");
    const firstDataRow = within(table).getAllByRole("row")[1]!;
    const cells = within(firstDataRow).getAllByRole("cell");
    expect(cells[durationHeaderIndex]?.textContent).toBe("—");
  });

  it("shows the empty state when there are no runs, and Refresh pulls new ones in", async () => {
    stubFetch({ "GET /ci-runs": [] });
    renderWithProviders(<CiRunsTable />);
    expect(await screen.findByText("No CI runs yet")).toBeInTheDocument();

    stubFetch({ "GET /ci-runs": [], "POST /ci-runs/refresh": { ingested: 1, rejected: 0 } });
    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /refreshing/i })).not.toBeInTheDocument());
  });
});
