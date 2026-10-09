/* Shared test helpers for the eval UI: providers (QueryClient + next-intl +
   toasts), a route-keyed `fetch` stub, and typed fixtures. Component tests mock
   `fetch`, never the hooks, so the real api/hook layer is exercised. */
import React from "react";
import { vi } from "vitest";
import { render, type RenderResult } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCaseSummary, EvalSuiteRun } from "@devdigest/shared";
import { ToastProvider } from "@/lib/toast";
import evalMessages from "../../messages/en/eval.json";
import prReviewMessages from "../../messages/en/prReview.json";
import agentsMessages from "../../messages/en/agents.json";
import shellMessages from "../../messages/en/shell.json";

export function renderWithProviders(ui: React.ReactElement): RenderResult {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider
        locale="en"
        messages={{ eval: evalMessages, prReview: prReviewMessages, agents: agentsMessages, shell: shellMessages }}
      >
        <ToastProvider>{ui}</ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

export interface FetchCall {
  method: string;
  path: string;
  body: unknown;
}
export interface StubResponse {
  status: number;
  body: unknown;
}
export const reply = (body: unknown, status = 200): StubResponse => ({ status, body });
export const apiError = (code: string, message: string, status: number): StubResponse => ({
  status,
  body: { error: { code, message } },
});

type Handler = StubResponse | unknown | ((call: FetchCall) => StubResponse | unknown);

/** Stub global fetch. Keys are "METHOD /path" (query string included); unknown routes 404. */
export function stubFetch(handlers: Record<string, Handler>): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url).replace(/^https?:\/\/[^/]+/, "");
      const call: FetchCall = {
        method: init?.method ?? "GET",
        path,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      };
      calls.push(call);
      const h = handlers[`${call.method} ${path}`];
      if (h === undefined) {
        return new Response(JSON.stringify({ error: { code: "not_found", message: `no stub: ${call.method} ${path}` } }), { status: 404 });
      }
      const out = typeof h === "function" ? (h as (c: FetchCall) => unknown)(call) : h;
      const r: StubResponse =
        out && typeof out === "object" && "status" in out && "body" in out ? (out as StubResponse) : { status: 200, body: out };
      return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
    }),
  );
  return calls;
}

const CONFIG = {
  provider: "openai" as const,
  model: "gpt-4.1",
  system_prompt: "You are a reviewer.",
  output_schema: null,
  strategy: "single-pass" as const,
  ci_fail_on: "critical" as const,
  repo_intel: true,
  skills: [] as string[],
};

export function suiteRun(over: Partial<EvalSuiteRun> = {}): EvalSuiteRun {
  return {
    id: "run1",
    agent_id: "ag1",
    agent_name: "Security Reviewer",
    agent_version: 1,
    config_snapshot: CONFIG,
    status: "completed",
    reason: null,
    recall: 0.8,
    precision: 0.9,
    citation_accuracy: 1,
    cases_passed: 3,
    cases_total: 4,
    cost_usd: 0.12,
    duration_ms: 4000,
    ran_at: "2026-10-01T10:00:00.000Z",
    error: null,
    ...over,
  };
}

export function caseSummary(over: Partial<EvalCaseSummary> = {}): EvalCaseSummary {
  return {
    id: "c1",
    owner_kind: "agent",
    owner_id: "ag1",
    name: "stripe-key-leak",
    input_diff: "--- a/src/config.ts\n+++ b/src/config.ts\n@@ -1 +1 @@\n+key",
    input_files: ["src/config.ts"],
    input_meta: { pr_title: "Add Stripe", pr_description: "wire payments", agent_id: "ag1" },
    expectation: "must_find",
    expected_output: [{ file: "src/config.ts", start_line: 1, end_line: 1, severity: "CRITICAL", category: "security", title: "key" }],
    source_finding_id: null,
    notes: null,
    created_at: "2026-10-01T09:00:00.000Z",
    updated_at: "2026-10-01T09:00:00.000Z",
    invalid: false,
    invalid_reason: null,
    edited_since_last_run: false,
    last_run: { status: "never_run", run_id: null, ran_at: null, expected_count: null, actual_count: null, error: null },
    ...over,
  };
}
