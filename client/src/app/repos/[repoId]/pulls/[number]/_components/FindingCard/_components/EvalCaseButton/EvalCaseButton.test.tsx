import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, fireEvent, cleanup } from "@testing-library/react";
import type { FindingRecord } from "@devdigest/shared";
import { renderWithProviders, stubFetch, reply, apiError } from "@/test/eval-utils";
import { EvalCaseButton } from "./EvalCaseButton";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "r",
  suggestion: null,
  confidence: 0.9,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

describe("EvalCaseButton", () => {
  it("is disabled with a hint until the finding is accepted or dismissed", () => {
    stubFetch({});
    renderWithProviders(<EvalCaseButton finding={FINDING} />);
    const btn = screen.getByRole("button", { name: /turn into eval case/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAccessibleDescription("Accept or dismiss this finding first");
  });

  it("creates the case, then shows 'Case created' with a link to the agent's Evals tab", async () => {
    const calls = stubFetch({
      "POST /findings/f1/eval-case": reply({ created: true, agent_id: "ag1", case: { id: "c1", owner_id: "ag1" } }, 201),
    });
    renderWithProviders(<EvalCaseButton finding={{ ...FINDING, accepted_at: "2026-10-01T00:00:00Z" }} />);
    fireEvent.click(screen.getByRole("button", { name: /turn into eval case/i }));
    expect(await screen.findByText("Case created")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view in evals/i })).toHaveAttribute("href", "/agents/ag1?tab=evals");
    expect(calls).toEqual([{ method: "POST", path: "/findings/f1/eval-case", body: undefined }]);
  });

  it("shows a reason-specific message when the server refuses", async () => {
    stubFetch({ "POST /findings/f1/eval-case": apiError("diff_too_large", "too big", 422) });
    renderWithProviders(<EvalCaseButton finding={{ ...FINDING, dismissed_at: "2026-10-01T00:00:00Z" }} />);
    fireEvent.click(screen.getByRole("button", { name: /turn into eval case/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("too large to store as an eval case");
  });
});
