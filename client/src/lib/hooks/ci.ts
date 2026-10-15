/* hooks/ci.ts — React Query hooks for SPEC-05 Export to CI: the agent's CI
   tab (installations + runs), the Export Wizard's generate/install action,
   the global CI Runs page, and the manual Refresh-ingestion pull. Components
   never fetch directly — this is the one place that calls `/agents/:id/ci`,
   `/agents/:id/export-ci`, `/agents/:id/ci/refresh`, `/ci-runs`. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { CiExport, CiExportInput, CiInstallation, CiRun } from "@devdigest/shared";

export const ciKeys = {
  agentCi: (agentId: string) => ["agent-ci", agentId] as const,
  runs: (filters: CiRunsFilters) => ["ci-runs", filters] as const,
};

export interface AgentCiTab {
  installations: CiInstallation[];
  runs: CiRun[];
}

/** An agent's CI tab (AC-18): its tracked installations + their run history. */
export function useAgentCi(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ciKeys.agentCi(agentId ?? ""),
    queryFn: () => api.get<AgentCiTab>(`/agents/${agentId}/ci`),
    enabled: !!agentId,
  });
}

/** Export Wizard's Install step — generate the files and (optionally) open the PR (AC-1..AC-8). */
export function useExportCi(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CiExportInput) => api.post<CiExport>(`/agents/${agentId}/export-ci`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ciKeys.agentCi(agentId) }),
  });
}

/** CI tab's Refresh — pull-ingest this agent's installed repos (AC-15/16). */
export function useRefreshAgentCi(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ ingested: number; rejected: number }>(`/agents/${agentId}/ci/refresh`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ciKeys.agentCi(agentId) }),
  });
}

export interface CiRunsFilters {
  agent_id?: string;
  repo?: string;
  status?: string;
}

function toQuery(filters: CiRunsFilters): string {
  const params = new URLSearchParams();
  if (filters.agent_id) params.set("agent_id", filters.agent_id);
  if (filters.repo) params.set("repo", filters.repo);
  if (filters.status) params.set("status", filters.status);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** The global CI Runs page (AC-17). */
export function useCiRuns(filters: CiRunsFilters = {}) {
  return useQuery({
    queryKey: ciKeys.runs(filters),
    queryFn: () => api.get<CiRun[]>(`/ci-runs${toQuery(filters)}`),
  });
}

/** CI Runs page's Refresh — pull-ingest every installed repo in the workspace. */
export function useRefreshCiRuns() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ ingested: number; rejected: number }>("/ci-runs/refresh"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ci-runs"] }),
  });
}
