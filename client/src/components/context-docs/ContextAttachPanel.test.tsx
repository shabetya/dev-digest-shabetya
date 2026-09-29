import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/context.json";

const FILES = [
  { path: "docs/a.md", tokens: 100, group: "docs", used_by_agents: 1 },
  { path: "docs/b.md", tokens: 50, group: "docs", used_by_agents: 0 },
  { path: "specs/c.md", tokens: 25, group: "specs", used_by_agents: 0 },
];
let repoId: string | null = "r1";
vi.mock("@/lib/repo-context", () => ({ useActiveRepo: () => ({ repoId }) }));
vi.mock("@/lib/hooks/context", () => ({
  useContextFiles: () => ({ data: { files: FILES, truncated: false }, isLoading: false, isError: false }),
  useContextPreview: () => ({ data: undefined, isLoading: true, isError: false }),
}));

import { ContextAttachPanel } from "./ContextAttachPanel";

afterEach(() => {
  cleanup();
  repoId = "r1";
});

function renderPanel(props: Partial<React.ComponentProps<typeof ContextAttachPanel>> = {}) {
  const onSave = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ContextAttachPanel paths={["docs/a.md", "gone.md"]} saving={false} saved={false} onSave={onSave} {...props} />
    </NextIntlClientProvider>,
  );
  return onSave;
}

describe("ContextAttachPanel", () => {
  it("shows counts/total, not-found and inherited rows; reorders by keyboard and saves", () => {
    const onSave = renderPanel({ inherited: ["specs/c.md", "docs/a.md"] });
    expect(screen.getByText("2 of 3 attached")).toBeInTheDocument();
    expect(screen.getByText("≈ 125 tokens")).toBeInTheDocument();
    expect(screen.getByText("not found in this repo")).toBeInTheDocument();
    expect(screen.getByText("inherited from skill")).toBeInTheDocument();

    fireEvent.click(screen.getAllByLabelText("Move down")[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(["gone.md", "docs/a.md"]);
  });

  it("shows an empty state with Save disabled when no repo is active", () => {
    repoId = null;
    renderPanel();
    expect(screen.getByText("Select a repo to attach context")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save/ })).toBeDisabled();
  });
});
