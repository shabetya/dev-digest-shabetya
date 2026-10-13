import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, fireEvent, cleanup } from "@testing-library/react";
import type { Agent, CiInstallation } from "@devdigest/shared";
import { renderWithProviders, stubFetch, reply } from "@/test/ci-utils";
import { UpdateConfigDialog } from "./UpdateConfigDialog";

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
  system_prompt: "p",
  output_schema: null,
  enabled: true,
  version: 1,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
};

const INSTALLATION: CiInstallation = {
  id: "i1",
  agent_id: "ag1",
  repo: "acme/payments-api",
  target_type: "gha",
  installed_at: "2026-06-01T00:00:00.000Z",
};

describe("UpdateConfigDialog (Fix C)", () => {
  it("skips Target entirely and re-exports to the already-known repo in one click, then shows the PR link", async () => {
    const calls = stubFetch({
      "POST /agents/ag1/export-ci": reply({
        installation: INSTALLATION,
        files: [],
        pr_url: "https://github.com/acme/payments-api/pull/11",
      }),
    });
    renderWithProviders(<UpdateConfigDialog agent={AGENT} installation={INSTALLATION} onClose={vi.fn()} />);

    // The repo is shown (reused from the installation), no Target step rendered.
    expect(screen.getAllByText(/acme\/payments-api/).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Target repository")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Re-publish (update)" }));
    expect(await screen.findByRole("link", { name: "View pull request" })).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/pull/11",
    );

    const body = calls.find((c) => c.method === "POST")?.body as { repo?: string; action?: string } | undefined;
    expect(body?.repo).toBe("acme/payments-api");
    expect(body?.action).toBe("open_pr");
  });

  it("closes without exporting when Cancel is clicked", async () => {
    stubFetch({ "POST /agents/ag1/export-ci": reply({ installation: INSTALLATION, files: [], pr_url: null }) });
    const onClose = vi.fn();
    renderWithProviders(<UpdateConfigDialog agent={AGENT} installation={INSTALLATION} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });
});
