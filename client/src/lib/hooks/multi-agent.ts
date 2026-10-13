/* hooks/multi-agent.ts — Multi-Agent Review (SPEC-05). The combined
   {columns, conflicts} detail for one multi-run (GET /multi-agent-runs/:id)
   and per-agent cost/time estimates (GET /agents/estimates). SSE (live
   findings/status while a column is still running) layers on top via the
   existing `useRunEvents` (hooks/reviews.ts) — this file is the polled,
   server-sourced "reload the page mid-run and still see the right state"
   source of truth, mirroring `usePrRuns`'s refetchInterval pattern. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { AgentEstimateList, MultiAgentRun } from "@devdigest/shared";

/** Combined columns + conflicts for one multi-agent run. Polls every 4s while
   any column is still `running`, so a reload mid-flight reconstructs the same
   view this endpoint already is for — the server is the source of truth,
   never client-only state (AC-12, Non-functional/Reliability). */
export function useMultiAgentRun(multiRunId: string | null | undefined) {
  return useQuery({
    queryKey: ["multi-agent-run", multiRunId],
    queryFn: () => api.get<MultiAgentRun>(`/multi-agent-runs/${multiRunId}`),
    enabled: !!multiRunId,
    refetchInterval: (query) =>
      (query.state.data?.columns ?? []).some((c) => c.status === "running") ? 4000 : false,
  });
}

/** Per-agent + "no history yet" cost/time estimates (AC-22/23) for the
   picker/Configure-Run page. Workspace-wide — not scoped to one PR. */
export function useAgentEstimates() {
  return useQuery({
    queryKey: ["agent-estimates"],
    queryFn: () => api.get<AgentEstimateList>(`/agents/estimates`),
  });
}
