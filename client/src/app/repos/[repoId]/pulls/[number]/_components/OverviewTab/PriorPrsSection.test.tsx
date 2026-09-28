import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PriorPr } from "@devdigest/shared";
import blastMessages from "../../../../../../../../messages/en/blast.json";
import { PriorPrsSection } from "./PriorPrsSection";

afterEach(() => cleanup());

function renderSection(priorPrs: PriorPr[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: blastMessages }}>
      <PriorPrsSection priorPrs={priorPrs} repoId="repo-1" />
    </NextIntlClientProvider>,
  );
}

describe("PriorPrsSection", () => {
  it("starts collapsed, then expands to reveal a linked prior PR with its takeaway", () => {
    renderSection([
      {
        number: 42,
        title: "Rework auth",
        author: "marisa.koch",
        date: "2026-01-01T00:00:00.000Z",
        takeaway: "Tightened session expiry.",
      },
    ]);

    expect(screen.getByText("Prior PRs touching these files")).toBeInTheDocument();
    expect(screen.queryByText(/rework auth/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Prior PRs touching these files"));

    const link = screen.getByRole("link", { name: /#42 rework auth/i });
    expect(link).toHaveAttribute("href", "/repos/repo-1/pulls/42");
    expect(screen.getByText(/marisa\.koch/)).toBeInTheDocument();
    expect(screen.getByText("Tightened session expiry.")).toBeInTheDocument();
  });

  it("renders no third line for a prior PR with no completed review (takeaway: null)", () => {
    renderSection([
      { number: 7, title: "Fix login race", author: "aiko.tanaka", date: null, takeaway: null },
    ]);

    fireEvent.click(screen.getByText("Prior PRs touching these files"));

    expect(screen.getByRole("link", { name: /#7 fix login race/i })).toBeInTheDocument();
    expect(screen.queryByText(/no summary/i)).not.toBeInTheDocument();
  });

  it("renders nothing when there are no prior PRs", () => {
    renderSection([]);
    expect(screen.queryByText("Prior PRs touching these files")).not.toBeInTheDocument();
  });
});
