import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BlastRadiusResponse } from "@devdigest/shared";
import blastMessages from "../../../../../../../../messages/en/blast.json";

let blastData: BlastRadiusResponse | undefined;
let isLoading = false;

vi.mock("../../../../../../../lib/hooks/blast", () => ({
  useBlastRadius: () => ({ data: blastData, isLoading }),
}));

import { BlastRadiusCard } from "./BlastRadiusCard";

afterEach(() => {
  cleanup();
  blastData = undefined;
  isLoading = false;
});

function renderCard() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: blastMessages }}>
      <BlastRadiusCard prId="pr-1" repoId="repo-1" repoFullName="acme/payments-api" headSha="a1b2c3d4" />
    </NextIntlClientProvider>,
  );
}

function response(overrides: Partial<BlastRadiusResponse> = {}): BlastRadiusResponse {
  return {
    changed_symbols: [{ name: "chargeCard", file: "src/service.ts", kind: "function" }],
    downstream: [
      {
        symbol: "chargeCard",
        callers: [{ name: "handlePayment", file: "src/routes/payments.ts", line: 10 }],
        endpoints_affected: ["POST /payments"],
        crons_affected: [],
      },
    ],
    summary: "1 changed symbol(s), 1 caller(s), 1 endpoint(s)/0 cron(s) affected.",
    degraded: false,
    degraded_reason: null,
    prior_prs: [],
    ...overrides,
  };
}

describe("BlastRadiusCard", () => {
  it("renders nothing while loading, then shows counts and expands a group to reveal a caller file:line link", () => {
    isLoading = true;
    const { rerender } = renderCard();
    expect(screen.queryByText("Blast radius")).not.toBeInTheDocument();

    isLoading = false;
    blastData = response();
    rerender(
      <NextIntlClientProvider locale="en" messages={{ blast: blastMessages }}>
        <BlastRadiusCard prId="pr-1" repoId="repo-1" repoFullName="acme/payments-api" headSha="a1b2c3d4" />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Blast radius")).toBeInTheDocument();
    const stats = within(screen.getByTestId("blast-stats"));
    expect(stats.getByText(/1 symbols/)).toBeInTheDocument();
    expect(stats.getByText(/1 callers/)).toBeInTheDocument();
    expect(stats.getByText(/1 endpoints/)).toBeInTheDocument();
    expect(screen.getByText("chargeCard")).toBeInTheDocument();

    // Caller is hidden until the group is expanded.
    expect(screen.queryByText(/src\/routes\/payments\.ts/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("chargeCard"));

    const link = screen.getByText(/src\/routes\/payments\.ts:10/);
    expect(link).toBeInTheDocument();
    expect(link.closest("a")).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/blob/a1b2c3d4/src/routes/payments.ts#L10",
    );
    expect(screen.getByText("POST /payments")).toBeInTheDocument();
  });

  it("shows a degraded indicator when the impact map was computed on the best-effort path", () => {
    blastData = response({ degraded: true, degraded_reason: "flag_off" });
    renderCard();

    expect(screen.getByText(/repo index incomplete/i)).toBeInTheDocument();
  });

  it("shows the no-downstream-callers state when every changed symbol has zero callers", () => {
    blastData = response({
      changed_symbols: [{ name: "unusedHelper", file: "src/service.ts", kind: "function" }],
      downstream: [
        { symbol: "unusedHelper", callers: [], endpoints_affected: [], crons_affected: [] },
      ],
    });
    renderCard();

    expect(screen.getByText(/no downstream callers found/i)).toBeInTheDocument();
    expect(screen.queryByText("unusedHelper")).not.toBeInTheDocument();
  });

  it("switches between the Tree and Graph views via the segmented toggle", () => {
    blastData = response();
    renderCard();

    // Tree view by default: both the overall stat and the per-group
    // caller-count badge read "1 callers"; only the latter is tree-only.
    expect(screen.getAllByText("1 callers")).toHaveLength(2);
    expect(screen.queryByRole("img", { name: "Blast radius graph" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "graph" }));

    expect(screen.getByRole("img", { name: "Blast radius graph" })).toBeInTheDocument();
    expect(screen.getAllByText("1 callers")).toHaveLength(1);

    fireEvent.click(screen.getByRole("tab", { name: "tree" }));
    expect(screen.getAllByText("1 callers")).toHaveLength(2);
  });

  it("expands the Prior PRs section to reveal a linked entry, and renders no third line when takeaway is null", () => {
    blastData = response({
      prior_prs: [
        {
          number: 42,
          title: "Rework auth",
          author: "marisa.koch",
          date: "2026-01-01T00:00:00.000Z",
          takeaway: "Tightened session expiry.",
        },
        { number: 7, title: "Fix login race", author: "aiko.tanaka", date: null, takeaway: null },
      ],
    });
    renderCard();

    fireEvent.click(screen.getByText("Prior PRs touching these files"));

    const link = screen.getByRole("link", { name: /#42 rework auth/i });
    expect(link).toHaveAttribute("href", "/repos/repo-1/pulls/42");
    expect(screen.getByText("Tightened session expiry.")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /#7 fix login race/i })).toBeInTheDocument();
    expect(screen.queryByText(/no summary/i)).not.toBeInTheDocument();
  });
});
