import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import type { Agent, EvalDashboard } from "@devdigest/shared";
import { renderWithProviders, stubFetch, reply, suiteRun, caseSummary } from "@/test/eval-utils";
import { EvalsTab } from "./EvalsTab";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
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
  version: 2,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
};

const DASH: EvalDashboard = {
  owner_kind: "agent",
  owner_id: "ag1",
  cases_total: 2,
  current: { recall: 0.8, precision: null, citation_accuracy: 1, traces_passed: 1, traces_total: 2, cost_usd: 0.1 },
  delta: { recall: -3, precision: null, citation_accuracy: 0 },
  trend: [],
  recent_runs: [],
  alert: null,
};

const CASES = [
  caseSummary({
    id: "c1",
    name: "stripe-key-leak",
    last_run: { status: "passed", run_id: "r", ran_at: "2026-10-01T10:00:00Z", expected_count: 1, actual_count: 1, error: null },
    edited_since_last_run: true,
  }),
  caseSummary({ id: "c2", name: "quiet-on-style", expectation: "must_not_flag", expected_output: [] }),
];

const base = () => ({
  "GET /agents/ag1/eval-cases": CASES,
  "GET /agents/ag1/eval-dashboard": DASH,
  "GET /agents/ag1/eval-runs": [],
});

describe("EvalsTab", () => {
  it("shows tiles with deltas (— for no data), the passing summary and each case's state", async () => {
    stubFetch(base());
    renderWithProviders(<EvalsTab agent={AGENT} />);
    expect(await screen.findByText("stripe-key-leak")).toBeInTheDocument();
    expect(screen.getByText("1 / 2 passing")).toBeInTheDocument();
    // recall tile: value + signed delta as text (not colour only)
    const recall = screen.getByRole("group", { name: "RECALL" });
    expect(within(recall).getByText("80%")).toBeInTheDocument();
    expect(within(recall).getByText("-3 pts")).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "PRECISION" })).getByText("—")).toBeInTheDocument();
    expect(screen.getByText("edited since last run")).toBeInTheDocument();
    expect(screen.getByText("empty []")).toBeInTheDocument();
    expect(screen.getAllByText("never run").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /view full dashboard/i })).toHaveAttribute("href", "/eval/ag1");
  });

  it("starts a suite, and surfaces a failed run (no LLM key) with its reason", async () => {
    const failed = suiteRun({ id: "run9", status: "failed", reason: "llm_unavailable", cases_passed: 0 });
    stubFetch(base());
    renderWithProviders(<EvalsTab agent={AGENT} />);
    await screen.findByText("stripe-key-leak");
    // After the POST the history refetch returns the failed run.
    const calls = stubFetch({ ...base(), "POST /agents/ag1/eval-runs": reply(failed, 202), "GET /agents/ag1/eval-runs": [failed] });
    fireEvent.click(screen.getByRole("button", { name: /run all evals/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("no LLM key is configured");
    expect(calls.some((c) => c.method === "POST" && c.path === "/agents/ag1/eval-runs")).toBe(true);
  });

  it("deletes a case only after confirmation", async () => {
    const calls = stubFetch({ ...base(), "DELETE /eval-cases/c2": { ok: true } });
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderWithProviders(<EvalsTab agent={AGENT} />);
    await screen.findByText("quiet-on-style");
    const del = screen.getByRole("button", { name: "Delete case quiet-on-style" });
    fireEvent.click(del);
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    fireEvent.click(del);
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.path === "/eval-cases/c2")).toBe(true));
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it("case editor: invalid JSON disables Save/Run, the skeleton fixes it, Run on save persists locally, Esc closes", async () => {
    const calls = stubFetch({
      ...base(),
      "POST /agents/ag1/eval-cases": reply(caseSummary({ id: "c3", name: "new-one" }), 201),
    });
    renderWithProviders(<EvalsTab agent={AGENT} />);
    await screen.findByText("stripe-key-leak");
    fireEvent.click(screen.getByRole("button", { name: /new eval case/i }));
    const dialog = await screen.findByRole("dialog");
    const save = within(dialog).getByRole("button", { name: "Save" });
    const run = within(dialog).getByRole("button", { name: /run case/i });
    expect(save).toBeDisabled(); // no name yet

    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "new-one" } });
    expect(save).toBeEnabled();
    fireEvent.change(within(dialog).getByLabelText("Expected output"), { target: { value: "[{" } });
    expect(within(dialog).getByText("invalid JSON")).toBeInTheDocument();
    expect(save).toBeDisabled();
    expect(run).toBeDisabled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Finding skeleton" }));
    expect(within(dialog).getByText("valid JSON")).toBeInTheDocument();
    expect(save).toBeEnabled();

    fireEvent.click(within(dialog).getByRole("switch", { name: /run on save/i }));
    expect(window.localStorage.getItem("devdigest.eval.runOnSave")).toBe("1");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(calls.some((c) => c.method === "POST" && c.path === "/agents/ag1/eval-cases")).toBe(false);
  });

  it("case editor: Save posts the validated body and closes the modal", async () => {
    const calls = stubFetch({
      ...base(),
      "POST /agents/ag1/eval-cases": reply(caseSummary({ id: "c3", name: "new-one" }), 201),
    });
    renderWithProviders(<EvalsTab agent={AGENT} />);
    await screen.findByText("stripe-key-leak");
    fireEvent.click(screen.getByRole("button", { name: /new eval case/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "new-one" } });
    fireEvent.change(within(dialog).getByLabelText("Expectation"), { target: { value: "must_not_flag" } });
    fireEvent.change(within(dialog).getByLabelText("Expected output"), { target: { value: "[]" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const post = calls.find((c) => c.method === "POST" && c.path === "/agents/ag1/eval-cases");
    expect(post?.body).toMatchObject({ name: "new-one", expectation: "must_not_flag", expected_output: [] });
  });
});
