/* Shared test helpers for the SPEC-05 Export-to-CI UI (CiTab, CiRunsTable,
   ExportWizard): providers (QueryClient + next-intl + toasts) and a
   route-keyed `fetch` stub. Mirrors `@/test/eval-utils`'s generic parts —
   kept separate because it needs the `ci` message namespace, not `eval`. */
import React from "react";
import { vi } from "vitest";
import { render, type RenderResult } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { ToastProvider } from "@/lib/toast";
import ciMessages from "../../messages/en/ci.json";
import agentsMessages from "../../messages/en/agents.json";
import shellMessages from "../../messages/en/shell.json";

export function renderWithProviders(ui: React.ReactElement): RenderResult {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ ci: ciMessages, agents: agentsMessages, shell: shellMessages }}>
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
        return new Response(
          JSON.stringify({ error: { code: "not_found", message: `no stub: ${call.method} ${path}` } }),
          { status: 404 },
        );
      }
      const out = typeof h === "function" ? (h as (c: FetchCall) => unknown)(call) : h;
      const r: StubResponse =
        out && typeof out === "object" && "status" in out && "body" in out
          ? (out as StubResponse)
          : { status: 200, body: out };
      return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
    }),
  );
  return calls;
}
