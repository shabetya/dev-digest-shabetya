import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../messages/en/multiAgentReview.json";

// vi.mock factories are hoisted above the file's top-level code, so every
// vi.fn() a factory closes over must come from vi.hoisted() (plain `const`s
// declared below would hit the TDZ at hoist time).
const { push, replace, findingActionMutate, evalCaseMutate, notifyInfo, fetchSpy, searchParamsRef, useMultiAgentRunMock } = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  findingActionMutate: vi.fn(),
  evalCaseMutate: vi.fn(),
  notifyInfo: vi.fn(),
  fetchSpy: vi.fn(),
  // A test sets `.value` before renderView() to simulate a `?trace=` URL
  // already present (there's no real Next.js router in this unit test to
  // round-trip router.replace() back into useSearchParams()).
  searchParamsRef: { value: new URLSearchParams() },
  // A `vi.fn()` (not a bare factory) so one test can override the resolved
  // data via `mockReturnValueOnce` to exercise the `conflicts_status:
  // 'pending'` rendering path without a second fixture file.
  useMultiAgentRunMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => searchParamsRef.value,
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/run-trace-drawer", () => ({
  default: ({ runId, agentName, onClose }: { runId: string; agentName?: string | null; onClose: () => void }) => (
    <div data-testid="trace-drawer">
      trace for {agentName} ({runId})
      <button onClick={onClose}>close-drawer</button>
    </div>
  ),
}));
vi.mock("@/lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: findingActionMutate, isPending: false }),
}));
vi.mock("@/lib/hooks/eval", () => ({
  useTurnIntoEvalCase: () => ({ mutate: evalCaseMutate, isPending: false, isSuccess: false }),
}));
vi.mock("@/lib/toast", () => ({ notify: { info: notifyInfo, success: vi.fn(), error: vi.fn() } }));

const DATA = {
  id: "multi-1",
  pr_id: "pr1",
  pr_number: 42,
  ran_at: "2024-01-01T00:00:00Z",
  agent_count: 2,
  total_duration_ms: 10000,
  total_cost_usd: 0.06,
  columns: [
    {
      run_id: "run1",
      agent_id: "a1",
      agent_name: "Security",
      provider: "openai",
      model: "gpt-4.1",
      status: "done",
      verdict: null,
      score: 90,
      summary: null,
      duration_ms: 6000,
      cost_usd: 0.03,
      findings: [
        {
          id: "f1",
          severity: "CRITICAL",
          category: "security",
          title: "Hardcoded secret",
          file: "src/x.ts",
          start_line: 10,
          kind: "finding",
          confidence: 0.9,
          rationale: "A secret is committed in source.",
          suggestion: "Move it to an env var.",
          accepted_at: null,
          dismissed_at: null,
        },
      ],
    },
    {
      run_id: null,
      agent_id: "a2",
      agent_name: "Approver",
      provider: null,
      model: null,
      status: "deleted",
      verdict: null,
      score: null,
      summary: null,
      duration_ms: null,
      cost_usd: null,
      findings: [],
    },
  ],
  conflicts: [
    {
      file: "src/x.ts",
      line: 10,
      title: "Hardcoded secret",
      takes: [
        { agent_id: "a1", persona: "Security", verdict: "CRITICAL", note: "Hardcoded secret" },
        { agent_id: "a2", persona: "Approver", verdict: "ignored", note: "Did not flag this location." },
      ],
    },
    {
      file: "src/y.ts",
      line: 5,
      title: "Agreement finding",
      takes: [
        { agent_id: "a1", persona: "Security", verdict: "WARNING", note: "Agreement finding" },
        { agent_id: "a2", persona: "Approver", verdict: "WARNING", note: "Agreement finding" },
      ],
    },
  ],
  conflicts_status: "computed",
};

// Same two columns, but mid-flight: one still `running`, nothing computed
// yet (empty `conflicts` + `conflicts_status: 'pending'` — the state Fix 2
// adds a distinct rendering for, vs. "computed, agents agree").
const PENDING_DATA = {
  ...DATA,
  columns: [{ ...DATA.columns[0], status: "running" }, DATA.columns[1]],
  conflicts: [],
  conflicts_status: "pending",
};

useMultiAgentRunMock.mockReturnValue({ data: DATA, isLoading: false, isError: false, error: null, refetch: vi.fn() });
vi.mock("@/lib/hooks/multi-agent", () => ({
  useMultiAgentRun: () => useMultiAgentRunMock(),
}));

vi.stubGlobal("fetch", fetchSpy);

import { MultiAgentReviewView } from "./MultiAgentReviewView";

afterEach(() => {
  cleanup();
  push.mockClear();
  replace.mockClear();
  findingActionMutate.mockClear();
  evalCaseMutate.mockClear();
  notifyInfo.mockClear();
  fetchSpy.mockClear();
  searchParamsRef.value = new URLSearchParams();
});

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ multiAgentReview: messages }}>
      <MultiAgentReviewView multiRunId="multi-1" />
    </NextIntlClientProvider>,
  );
}

describe("MultiAgentReviewView", () => {
  it("renders Columns view with a 'run deleted' placeholder, navigates to ?trace= on an accessible trigger, and mounts the single drawer scoped to that run (AC-12/13/15)", () => {
    renderView();

    // Both agent names also appear in the always-rendered conflicts panel
    // (persona labels), so assert presence via getAllByText.
    expect(screen.getAllByText("Security").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Approver").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("This agent's run was deleted")).toBeInTheDocument();

    const traceBtn = screen.getByRole("button", { name: "View trace & logs for Security" });
    expect(screen.queryByTestId("trace-drawer")).not.toBeInTheDocument();

    // Clicking "View trace" navigates to a `?trace=<runId>` URL — the same
    // page-level query-param pattern usePrDetailPage already uses, which is
    // what actually drives the single mounted RunTraceDrawer instance.
    fireEvent.click(traceBtn);
    expect(replace).toHaveBeenCalledWith(expect.stringContaining("trace=run1"));

    // Re-render with that param already present (no real Next.js router to
    // round-trip replace() back into useSearchParams() in this unit test) —
    // confirms the drawer mounts scoped to the right run and "closing" it
    // navigates back to no `trace` param.
    cleanup();
    searchParamsRef.value = new URLSearchParams("trace=run1");
    renderView();
    expect(screen.getByTestId("trace-drawer")).toHaveTextContent("trace for Security (run1)");
    fireEvent.click(screen.getByText("close-drawer"));
    const lastCallUrl = replace.mock.calls.at(-1)?.[0] as string;
    expect(lastCallUrl).not.toContain("trace=");
  });

  it("Tabs+detail view shows the finding's full detail, wires Accept to the existing hook, and Learn is a zero-network stub (AC-14/19/21)", () => {
    renderView();

    fireEvent.click(screen.getByText("Tabs"));
    // "Hardcoded secret" appears twice once the Tabs view is open — once as
    // the finding's own title, once as the (always-rendered) conflicts
    // panel's block title for the same location — so assert via the
    // file:line/suggestion text, which only the finding detail renders.
    expect(screen.getAllByText("Hardcoded secret").length).toBeGreaterThanOrEqual(1);
    // "src/x.ts:10" also appears in the always-rendered conflicts panel's
    // location line for the same spot.
    expect(screen.getAllByText("src/x.ts:10").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Move it to an env var.")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Accept"));
    expect(findingActionMutate).toHaveBeenCalledWith({ findingId: "f1", action: "accept", prId: "pr1" });

    fireEvent.click(screen.getByText("Learn"));
    expect(notifyInfo).toHaveBeenCalledWith("Coming soon — part of the Memory feature");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("'Where agents disagree' lists every agent's verdict incl. 'ignored', and 'Show only conflicts' hides full-agreement locations (AC-16/17/18)", () => {
    renderView();

    expect(screen.getByText("Where agents disagree")).toBeInTheDocument();
    expect(screen.getByText("Agreement finding")).toBeInTheDocument();
    expect(screen.getByText("Did not flag this")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Show only conflicts"));
    expect(screen.queryByText("Agreement finding")).not.toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("renders a distinct pending state (not the 'agents agree' empty state) while conflicts_status is 'pending' (Fix 2)", () => {
    useMultiAgentRunMock.mockReturnValueOnce({
      data: PENDING_DATA,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderView();

    expect(screen.getByText("Where agents disagree")).toBeInTheDocument();
    expect(
      screen.getByText("Waiting for more agents to finish before comparing findings…"),
    ).toBeInTheDocument();
    // Neither the "computed, zero disagreements" empty states nor any
    // conflict block should render while pending.
    expect(screen.queryByText("No disagreements to show.")).not.toBeInTheDocument();
    expect(screen.queryByText("Every agent agrees at every flagged location.")).not.toBeInTheDocument();
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
    // The toggle is disabled — there's nothing to filter yet.
    expect(screen.getByRole("switch")).toBeDisabled();
  });
});
