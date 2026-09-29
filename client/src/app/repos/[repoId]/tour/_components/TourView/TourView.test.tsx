import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, within, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { Onboarding } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/onboarding.json";
import { TourView } from "./TourView";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({
    activeRepo: { id: "r1", full_name: "acme/app", default_branch: "main" },
  }),
  useRepoNotFound: () => false,
}));

const TOUR: Onboarding = {
  version: 1,
  index_files: 42,
  generated_at: new Date(Date.now() - 3 * 3_600_000).toISOString(),
  sections: {
    architecture: {
      prose: "The `src/app.ts` file boots the server.",
      nodes: [
        { id: "web", label: "Web UI", kind: "client" },
        { id: "api", label: "API", kind: "server" },
      ],
      edges: [{ from: "web", to: "api", label: "HTTP" }],
    },
    critical_paths: [{ path: "src/app.ts", description: "Entry point", callers: 7 }],
    run_locally: [{ command: "cp .env.example .env", comment: "add keys" }],
    reading_path: [{ path: "README.md", reason: "Start here" }],
    first_tasks: [],
  },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function renderTour() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
        <TourView repoId="r1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  window.location.hash = "";
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TourView", () => {
  it("renders the five sections, collapses independently, and copies only the command", async () => {
    fetchMock.mockResolvedValue(json(TOUR));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderTour();

    expect(await screen.findByText(/Generated from index of 42 files · last refreshed 3h ago/)).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "On this page" });
    expect(within(nav).getAllByRole("link")).toHaveLength(5);
    expect(screen.getAllByRole("button", { expanded: true })).toHaveLength(5);
    expect(screen.getByRole("link", { name: /Open src\/app.ts on GitHub/ })).toHaveAttribute(
      "href",
      "https://github.com/acme/app/blob/main/src/app.ts",
    );
    expect(screen.getByText("7 callers")).toBeInTheDocument();
    // empty section keeps its card with an explicit empty state
    expect(screen.getByText("Nothing could be verified for this section")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Guided reading path" }));
    expect(screen.queryByText("Start here")).not.toBeInTheDocument();
    expect(screen.getByText("Entry point")).toBeInTheDocument();

    // anchor nav re-expands the collapsed section
    fireEvent.click(within(nav).getByRole("link", { name: "Guided reading path" }));
    expect(await screen.findByText("Start here")).toBeInTheDocument();
    expect(window.location.hash).toBe("#reading-path");

    fireEvent.click(screen.getByRole("button", { name: "Copy command 1" }));
    expect(writeText).toHaveBeenCalledWith("cp .env.example .env");
  });

  it("shows a Generate CTA on first visit and keeps the old tour with an error banner when Regenerate fails", async () => {
    fetchMock.mockResolvedValueOnce(json(null));
    renderTour();

    expect(screen.queryByRole("button", { name: "Regenerate" })).not.toBeInTheDocument();
    fetchMock.mockResolvedValueOnce(json(TOUR, 201));
    fireEvent.click(await screen.findByRole("button", { name: "Generate onboarding tour" }));
    expect(await screen.findByRole("heading", { name: "Architecture overview" })).toBeInTheDocument();

    fetchMock.mockResolvedValueOnce(
      json({ error: { code: "unprocessable", message: "x", details: { reason: "llm_unavailable" } } }, 502),
    );
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/language model is unavailable/);
    await waitFor(() => expect(screen.getByText("Entry point")).toBeInTheDocument());
  });

  it("falls back to a selectable field when the clipboard rejects Share link", async () => {
    fetchMock.mockResolvedValue(json(TOUR));
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    renderTour();
    fireEvent.click(await screen.findByRole("button", { name: "Share link" }));
    expect(await screen.findByRole("textbox", { name: "Copy this link" })).toHaveValue(
      `${window.location.origin}/repos/r1/tour`,
    );
  });

  it("never renders markdown images from prose", async () => {
    fetchMock.mockResolvedValue(
      json({
        ...TOUR,
        sections: {
          ...TOUR.sections,
          architecture: { ...TOUR.sections.architecture, prose: "Intro ![x](https://evil.example/p.png) text" },
        },
      }),
    );
    renderTour();
    expect(await screen.findByText(/Intro/)).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  it("expands and targets the section named in the URL hash on load", async () => {
    window.location.hash = "#reading-path";
    fetchMock.mockResolvedValue(json(TOUR));
    renderTour();
    expect(await screen.findByText("Start here")).toBeInTheDocument();
    expect(document.getElementById("reading-path")).toBeInTheDocument();
  });
});
