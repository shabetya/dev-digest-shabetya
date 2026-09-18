import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";
import { ConventionCard } from "./ConventionCard";

afterEach(cleanup);

const CANDIDATE: ConventionCandidate = {
  id: "c1",
  category: "async-await",
  rule: "Always use async/await instead of .then() chains",
  evidence_path: "src/api/users.ts",
  evidence_line_start: 23,
  evidence_line_end: 31,
  evidence_snippet: "const user = await db.users.find(id);",
  confidence: 0.91,
  status: "pending",
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("ConventionCard", () => {
  it("renders the rule, evidence path, and confidence", () => {
    renderWithIntl(<ConventionCard candidate={CANDIDATE} onAction={() => {}} />);
    expect(
      screen.getByText("Always use async/await instead of .then() chains"),
    ).toBeInTheDocument();
    expect(screen.getByText("src/api/users.ts:23-31")).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
  });

  it("fires accept/reject actions", () => {
    const onAction = vi.fn();
    renderWithIntl(<ConventionCard candidate={CANDIDATE} onAction={onAction} />);
    fireEvent.click(screen.getByText("Accept"));
    expect(onAction).toHaveBeenCalledWith("accept");
    fireEvent.click(screen.getByText("Reject"));
    expect(onAction).toHaveBeenCalledWith("reject");
  });

  it("labels the accept button 'Accepted' once accepted", () => {
    renderWithIntl(
      <ConventionCard candidate={{ ...CANDIDATE, status: "accepted" }} onAction={() => {}} />,
    );
    expect(screen.getByText("Accepted")).toBeInTheDocument();
  });
});
