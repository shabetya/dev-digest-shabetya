import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/runs.json";
import { ProjectContextBlock } from "./ProjectContextBlock";

afterEach(cleanup);

const BASE = {
  prompt_assembly: { system: "s", skills: null, memory: null, specs: null, user: "u" },
} as unknown as RunTrace;

function renderBlock(trace: RunTrace) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <ProjectContextBlock trace={trace} />
    </NextIntlClientProvider>,
  );
}

describe("ProjectContextBlock", () => {
  it("renders nothing for old traces", () => {
    const { container } = renderBlock(BASE);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows total tokens of injected docs and lists skipped docs with reasons", () => {
    renderBlock({
      ...BASE,
      prompt_assembly: { ...BASE.prompt_assembly, specs: "### a.md\nhello" },
      project_context_detail: [
        { path: "a.md", tokens: 30, status: "injected" },
        { path: "b.md", tokens: 20, status: "injected" },
        { path: "c.md", tokens: 999, status: "skipped", reason: "budget_exceeded" },
      ],
    } as RunTrace);
    expect(screen.getByText("Project context — attached specs (untrusted) — 50 tok")).toBeInTheDocument();
    expect(screen.getByText("c.md")).toBeInTheDocument();
    expect(screen.getByText("token budget exceeded")).toBeInTheDocument();
  });
});
