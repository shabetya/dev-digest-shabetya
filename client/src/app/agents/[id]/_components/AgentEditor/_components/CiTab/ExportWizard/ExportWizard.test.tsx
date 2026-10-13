import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import type { Agent, CiExport } from "@devdigest/shared";
import { renderWithProviders, stubFetch, reply } from "@/test/ci-utils";
import { ExportWizard } from "./ExportWizard";

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

function exportResult(over: Partial<CiExport> = {}): CiExport {
  return {
    installation: { id: "i1", agent_id: "ag1", repo: "acme/payments-api", target_type: "gha", installed_at: "2026-06-01T00:00:00Z" },
    files: [
      { path: ".devdigest/agents/security-reviewer.yaml", contents: "name: Security Reviewer\n", editable: true },
      { path: ".devdigest/memory.jsonl", contents: "", editable: true },
      {
        path: ".github/workflows/devdigest-review.yml",
        contents: "name: DevDigest Review\npermissions:\n  contents: read\n  pull-requests: write\n",
        editable: true,
      },
    ],
    pr_url: null,
    ...over,
  };
}

describe("ExportWizard", () => {
  it("walks Target → Preview → Configure → Install and opens a PR", async () => {
    const calls = stubFetch({ "POST /agents/ag1/export-ci": reply(exportResult()) });
    renderWithProviders(<ExportWizard agent={AGENT} onClose={vi.fn()} />);

    // Target: GitHub Actions is the only enabled card; fill the repo, continue.
    expect(screen.getAllByText("Coming soon")).toHaveLength(3); // circle/jenkins/cli disabled
    fireEvent.change(screen.getByLabelText("Target repository"), { target: { value: "acme/payments-api" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    // Preview: generated files appear, workflow shown editable.
    expect(await screen.findByText(".devdigest/agents/security-reviewer.yaml")).toBeInTheDocument();
    const workflowTextarea = screen.getByLabelText(".github/workflows/devdigest-review.yml") as HTMLTextAreaElement;
    expect(workflowTextarea.value).toContain("permissions:");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    // Configure: AC-6 secrets list + AC-20 hint are visible.
    expect(screen.getByText(/OPENROUTER_API_KEY/)).toBeInTheDocument();
    expect(screen.getByText(/No GitHub App needed/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    // Install: open a PR.
    const installCalls = stubFetch({
      "POST /agents/ag1/export-ci": reply(exportResult({ pr_url: "https://github.com/acme/payments-api/pull/9" })),
    });
    fireEvent.click(screen.getByRole("button", { name: "Install" }));
    expect(await screen.findByRole("link", { name: "View pull request" })).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/pull/9",
    );
    expect(installCalls.some((c) => (c.body as { action?: string } | undefined)?.action === "open_pr")).toBe(true);
    expect(calls.length).toBeGreaterThan(0);
  });

  it("sends the Preview step's edited workflow YAML back as workflow_yaml_override on Install (Fix A / AC-2)", async () => {
    stubFetch({ "POST /agents/ag1/export-ci": reply(exportResult()) });
    renderWithProviders(<ExportWizard agent={AGENT} initialRepo="acme/payments-api" onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Continue" })); // → Preview
    const workflowTextarea = (await screen.findByLabelText(
      ".github/workflows/devdigest-review.yml",
    )) as HTMLTextAreaElement;
    const edited = "name: Edited Workflow\non:\n  pull_request: {}\n";
    fireEvent.change(workflowTextarea, { target: { value: edited } });
    expect(screen.getByRole("alert")).toHaveTextContent(/replaces DevDigest's generated/);
    fireEvent.click(screen.getByRole("button", { name: "Continue" })); // → Configure
    fireEvent.click(screen.getByRole("button", { name: "Continue" })); // → Install

    const installCalls = stubFetch({
      "POST /agents/ag1/export-ci": reply(exportResult({ pr_url: "https://github.com/acme/payments-api/pull/9" })),
    });
    fireEvent.click(screen.getByRole("button", { name: "Install" }));
    await screen.findByRole("link", { name: "View pull request" });

    const installBody = installCalls.find(
      (c) => (c.body as { action?: string } | undefined)?.action === "open_pr",
    )?.body as { workflow_yaml_override?: string } | undefined;
    expect(installBody?.workflow_yaml_override).toBe(edited);
  });

  it("offers a repo select with the workspace's imported repos and fills the default branch on pick", async () => {
    stubFetch({
      "GET /repos": reply([
        { id: "r1", workspace_id: "w1", owner: "acme", name: "payments-api", full_name: "acme/payments-api", default_branch: "trunk", clone_path: null, last_polled_at: null, created_by: null },
      ]),
      "POST /agents/ag1/export-ci": reply(exportResult()),
    });
    renderWithProviders(<ExportWizard agent={AGENT} onClose={vi.fn()} />);

    const select = await screen.findByText("Select a repository…");
    fireEvent.click(select);
    fireEvent.click(await screen.findByRole("button", { name: "acme/payments-api" }));

    expect(await screen.findByText("acme/payments-api")).toBeInTheDocument();
    expect((screen.getByLabelText("Base branch") as HTMLInputElement).value).toBe("trunk");
  });

  it("offers a base-branch select sourced from the repo's GitHub branches once a repo is picked", async () => {
    stubFetch({
      "GET /repos": reply([
        { id: "r1", workspace_id: "w1", owner: "acme", name: "payments-api", full_name: "acme/payments-api", default_branch: "main", clone_path: null, last_polled_at: null, created_by: null },
      ]),
      "GET /repos/r1/branches": reply(["main", "develop"]),
      "POST /agents/ag1/export-ci": reply(exportResult()),
    });
    renderWithProviders(<ExportWizard agent={AGENT} onClose={vi.fn()} />);

    fireEvent.click(await screen.findByText("Select a repository…"));
    fireEvent.click(await screen.findByRole("button", { name: "acme/payments-api" }));

    const branchSelect = await screen.findByText("main");
    fireEvent.click(branchSelect);
    fireEvent.click(await screen.findByRole("button", { name: "develop" }));
    expect(await screen.findByText("develop")).toBeInTheDocument();
  });

  it("regenerates the preview when a Configure trigger is toggled", async () => {
    stubFetch({ "POST /agents/ag1/export-ci": reply(exportResult()) });
    renderWithProviders(<ExportWizard agent={AGENT} initialRepo="acme/payments-api" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" })); // → Preview
    await screen.findByText(".devdigest/agents/security-reviewer.yaml");
    fireEvent.click(screen.getByRole("button", { name: "Continue" })); // → Configure

    const calls = stubFetch({ "POST /agents/ag1/export-ci": reply(exportResult()) });
    fireEvent.click(screen.getByRole("checkbox", { name: "Reopened" }));
    await waitFor(() =>
      expect(
        calls.some((c) => {
          const triggers = (c.body as { triggers?: unknown } | undefined)?.triggers;
          return Array.isArray(triggers) && triggers.includes("reopened");
        }),
      ).toBe(true),
    );
  });
});
