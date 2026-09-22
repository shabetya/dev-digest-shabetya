import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile, ReviewRecord, SmartDiffResponse } from "@devdigest/shared";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";
import shellMessages from "../../../../../../../../messages/en/shell.json";

const findingActionMutate = vi.fn();

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  usePrComments: () => ({ data: [] }),
  useCreatePrComment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSmartDiff: () => ({ data: SMART_DIFF }),
  usePrReviews: () => ({ data: REVIEWS }),
  useFindingAction: () => ({ mutate: findingActionMutate, isPending: false }),
}));

import { DiffTab } from "./DiffTab";

afterEach(cleanup);

// One file per role, in Smart Diff's fixed display order. `service.ts` is
// given an artificially large additions count so it's collapsed by default
// (like docs/boilerplate) — letting the test drive an explicit expand click.
const FILES: PrFile[] = [
  {
    path: "src/service.ts",
    additions: 300,
    deletions: 0,
    patch: "@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: \"sk_live_xxx\",\n   redisUrl: x,",
  },
  { path: "src/service.test.ts", additions: 4, deletions: 0, patch: "@@ -1,1 +1,2 @@\n it('works');\n+it('works too');" },
  { path: "index.ts", additions: 1, deletions: 0, patch: "@@ -1,1 +1,1 @@\n-export {};\n+export * from './a';" },
  { path: "README.md", additions: 1, deletions: 0, patch: "@@ -1,1 +1,1 @@\n-old\n+new docs line" },
  // Deliberately SMALL (well under the auto-expand threshold) — the point of
  // this fixture is to prove `boilerplate` is force-collapsed by Smart Diff
  // (`initialOpen={false}`), not merely collapsed because it's a big file.
  { path: "pnpm-lock.yaml", additions: 3, deletions: 0, patch: "@@ -1,1 +1,1 @@\n-a\n+lockfile bump line" },
];

const SMART_DIFF: SmartDiffResponse = {
  groups: [
    { role: "core", files: [{ path: "src/service.ts", additions: 300, deletions: 0, finding_lines: [11] }] },
    { role: "tests", files: [{ path: "src/service.test.ts", additions: 4, deletions: 0, finding_lines: [] }] },
    { role: "wiring", files: [{ path: "index.ts", additions: 1, deletions: 0, finding_lines: [] }] },
    { role: "docs", files: [{ path: "README.md", additions: 1, deletions: 0, finding_lines: [] }] },
    { role: "boilerplate", files: [{ path: "pnpm-lock.yaml", additions: 3, deletions: 0, finding_lines: [] }] },
  ],
  split_suggestion: { too_big: false, total_lines: 806, proposed_splits: [] },
};

const REVIEWS: ReviewRecord[] = [
  {
    id: "r1",
    pr_id: "pr1",
    agent_id: null,
    run_id: null,
    agent_name: null,
    kind: "review",
    verdict: "request_changes",
    summary: "s",
    score: 40,
    model: "test-model",
    created_at: "2026-01-01T00:00:00Z",
    findings: [
      {
        id: "f1",
        severity: "CRITICAL",
        category: "security",
        title: "Hardcoded Stripe secret key",
        file: "src/service.ts",
        start_line: 11,
        end_line: 11,
        rationale: "A live Stripe key is committed in source.",
        suggestion: null,
        confidence: 0.95,
        kind: "finding",
        trifecta_components: null,
        evidence: null,
        review_id: "r1",
        accepted_at: null,
        dismissed_at: null,
      },
    ],
  },
];

function renderDiffTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: prReviewMessages, shell: shellMessages }}>
      <DiffTab prId="pr1" filesCount={FILES.length} files={FILES} canComment repoFullName="acme/x" headSha="a1b2c3d4" />
    </NextIntlClientProvider>,
  );
}

describe("DiffTab — Smart Diff grouping + toggle (full flow)", () => {
  it("renders 5 role groups in order with docs/boilerplate collapsed, shows a finding dot, expands to accept it, then toggles to the flat Original order view", () => {
    renderDiffTab();

    // 5 groups, in fixed display order.
    const groupHeadings = ["Core", "Tests", "Wiring", "Docs", "Boilerplate"];
    for (const label of groupHeadings) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }

    // The whole Boilerplate category starts collapsed — its file isn't even
    // rendered until the category header itself is expanded.
    expect(screen.queryByText("pnpm-lock.yaml")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Boilerplate"));
    expect(screen.getByText("pnpm-lock.yaml")).toBeInTheDocument();

    // ...and within the now-expanded category, the file itself still starts
    // collapsed (Smart Diff force-collapses boilerplate files individually
    // too) — its patch content isn't rendered until its own header is clicked.
    expect(screen.queryByText("lockfile bump line")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("pnpm-lock.yaml"));
    expect(screen.getByText("lockfile bump line")).toBeInTheDocument();

    // The core file (forced collapsed via a large additions count) shows a
    // finding-dot indicator while closed...
    const coreHeader = screen.getByText("src/service.ts").closest("div")!;
    expect(within(coreHeader).getByLabelText(/1 finding/i)).toBeInTheDocument();
    expect(screen.queryByText("Hardcoded Stripe secret key")).not.toBeInTheDocument();

    // ...and once expanded, renders the inline finding card with a working
    // Accept action wired to useFindingAction.
    fireEvent.click(screen.getByText("src/service.ts"));
    expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /accept/i }));
    expect(findingActionMutate).toHaveBeenCalledWith({ findingId: "f1", action: "accept", prId: "pr1" });

    // Toggling to "Original order" swaps to the flat, ungrouped DiffViewer —
    // the role group headings disappear, but every file still renders.
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.queryByText("Core")).not.toBeInTheDocument();
    expect(screen.getByText("src/service.ts")).toBeInTheDocument();
    expect(screen.getByText("README.md")).toBeInTheDocument();
  });
});
