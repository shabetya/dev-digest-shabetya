import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { FindingsBadges } from "./FindingsBadges";

afterEach(cleanup);

describe("FindingsBadges", () => {
  it("renders '—' when counts is null (never reviewed)", () => {
    render(<FindingsBadges counts={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders '—' when counts is undefined", () => {
    render(<FindingsBadges counts={undefined} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders a muted '0' when reviewed with no findings", () => {
    render(<FindingsBadges counts={{ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 }} />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("renders one badge per non-zero severity, in CRITICAL/WARNING/SUGGESTION order", () => {
    render(<FindingsBadges counts={{ CRITICAL: 2, WARNING: 1, SUGGESTION: 0 }} />);
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});
