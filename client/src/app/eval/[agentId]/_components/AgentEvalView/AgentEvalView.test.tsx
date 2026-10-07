import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import type { Agent, EvalCompare, EvalDashboard } from "@devdigest/shared";
import { renderWithProviders, stubFetch, reply, suiteRun } from "@/test/eval-utils";

vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { AgentEvalView } from "./AgentEvalView";

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
  system_prompt: "You are a reviewer.\nBe strict.",
  output_schema: null,
  enabled: true,
  version: 2,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
};

const OLD_BASE = suiteRun();
const OLD = suiteRun({
  id: "r1",
  agent_version: 6,
  ran_at: "2026-10-01T10:00:00Z",
  precision: 0.9,
  config_snapshot: { ...OLD_BASE.config_snapshot, system_prompt: "You are a reviewer.\nBe strict." },
});
const NEW = suiteRun({
  id: "r2",
  agent_version: 7,
  ran_at: "2026-10-02T10:00:00Z",
  precision: 0.7,
  config_snapshot: { ...OLD.config_snapshot, system_prompt: "You are a reviewer.\nBe lenient.", skills: ["s1"] },
});
const THIRD = suiteRun({ id: "r3", agent_version: 8, ran_at: "2026-10-03T10:00:00Z" });

const DASH: EvalDashboard = {
  owner_kind: "agent",
  owner_id: "ag1",
  cases_total: 4,
  current: { recall: 0.8, precision: 0.7, citation_accuracy: 1, traces_passed: 3, traces_total: 4, cost_usd: 0.1 },
  delta: { recall: 0, precision: -20, citation_accuracy: 0 },
  trend: [OLD, NEW].map((r) => ({ ran_at: r.ran_at, agent_version: r.agent_version, recall: r.recall, precision: r.precision, citation_accuracy: r.citation_accuracy, pass_rate: 0.75, cost_usd: 0.1 })),
  recent_runs: [THIRD, NEW, OLD],
  alert: "Precision dipped 20pts on v7 — compare with the previous run to see what changed.",
};

const COMPARE: EvalCompare = {
  a: OLD,
  b: NEW,
  delta: { recall: 0, precision: -20, citation_accuracy: 0, cost_usd: 0.01 },
  fixed: [],
  regressed: [{ case_id: "c1", case_name: "stripe-key-leak" }],
  only_in_a: [],
  only_in_b: [],
};

const handlers = () => ({
  "GET /agents/ag1": AGENT,
  "GET /agents": [AGENT],
  "GET /agents/ag1/skills": [],
  "GET /agents/ag1/eval-dashboard?days=30": DASH,
  "GET /eval-suite-runs/compare?a=r1&b=r2": COMPARE,
});

describe("AgentEvalView", () => {
  it("shows the alert, tiles with deltas and a runs table; Compare needs exactly two (max two) selections", async () => {
    stubFetch(handlers());
    renderWithProviders(<AgentEvalView agentId="ag1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Precision dipped 20pts on v7");
    expect(within(screen.getByRole("group", { name: "PRECISION" })).getByText("-20 pts")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Eval Dashboard/ })).toHaveAttribute("href", "/eval");

    const compare = screen.getByRole("button", { name: "Compare" });
    expect(compare).toBeDisabled();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(3);
    fireEvent.click(boxes[0]!);
    expect(compare).toBeDisabled();
    fireEvent.click(boxes[1]!);
    expect(compare).toBeEnabled();
    expect(boxes[2]).toBeDisabled(); // third selection blocked
  });

  it("compare modal: signed deltas, +/− prompt diff, regressed cases, and a confirmed Promote that PUTs the config then re-applies skills", async () => {
    const calls = stubFetch({
      ...handlers(),
      "PUT /agents/ag1": AGENT,
      "POST /agents/ag1/skills": [],
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWithProviders(<AgentEvalView agentId="ag1" />);
    await screen.findByRole("alert");
    const boxes = screen.getAllByRole("checkbox");
    fireEvent.click(boxes[1]!); // NEW
    fireEvent.click(boxes[2]!); // OLD
    fireEvent.click(screen.getByRole("button", { name: "Compare" }));

    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("Regressed (1)");
    expect(within(dialog).getByText("-20 pts")).toBeInTheDocument();
    expect(within(dialog).getByText("stripe-key-leak")).toBeInTheDocument();
    const diff = within(dialog).getByRole("group", { name: "System prompt diff" });
    expect(within(diff).getByLabelText("removed line")).toHaveTextContent("−");
    expect(within(diff).getByLabelText("added line")).toHaveTextContent("+");
    expect(diff).toHaveTextContent("Be lenient.");

    // v6 differs from the live agent only by prompt text; v7 also adds a skill. Promote v7.
    fireEvent.click(await within(dialog).findByRole("button", { name: "Promote v7" }));
    expect(confirm).toHaveBeenCalledOnce();
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.path === "/agents/ag1/skills")).toBe(true));
    const put = calls.find((c) => c.method === "PUT" && c.path === "/agents/ag1");
    expect(put?.body).toMatchObject({ system_prompt: "You are a reviewer.\nBe lenient.", model: "gpt-4.1" });
    expect(calls.find((c) => c.path === "/agents/ag1/skills" && c.method === "POST")?.body).toEqual({ skill_ids: ["s1"] });
    const order = calls.filter((c) => c.method !== "GET").map((c) => c.method);
    expect(order).toEqual(["PUT", "POST"]);

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
