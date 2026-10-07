/* hooks/eval.ts — React Query hooks for the eval pipeline (SPEC-04):
   turn a finding into a case, case CRUD, run a case / the suite, poll a suite
   run, dashboards, compare, and "Promote vX". Components never fetch directly. */
"use client";

import React from "react";
import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import type {
  Agent,
  AgentVersionConfig,
  EvalCaseBodyInput,
  EvalCaseCreated,
  EvalCasePatch,
  EvalCaseSummary,
  EvalCompare,
  EvalDashboard,
  EvalRunResult,
  EvalSuiteRun,
  EvalSuiteRunDetail,
  EvalWorkspaceDashboard,
  AgentSkillLink,
} from "@devdigest/shared";

/** Poll cadence while a suite is `running` (bounded; stops on terminal status). */
export const EVAL_POLL_MS = 2500;

export const evalKeys = {
  cases: (agentId: string) => ["eval-cases", agentId] as const,
  suiteRuns: (agentId: string) => ["eval-suite-runs", agentId] as const,
  suiteRun: (id: string) => ["eval-suite-run", id] as const,
  agentDashboard: (agentId: string) => ["eval-dashboard", agentId] as const,
  workspaceDashboard: ["eval-workspace-dashboard"] as const,
  compare: (a: string, b: string) => ["eval-compare", a, b] as const,
};

/** Everything an agent's eval screens derive from — refetched after any run/case change. */
function invalidateAgentEval(qc: QueryClient, agentId: string) {
  qc.invalidateQueries({ queryKey: evalKeys.cases(agentId) });
  qc.invalidateQueries({ queryKey: evalKeys.suiteRuns(agentId) });
  qc.invalidateQueries({ queryKey: evalKeys.agentDashboard(agentId) });
  qc.invalidateQueries({ queryKey: evalKeys.workspaceDashboard });
}

// ---- Finding → case --------------------------------------------------------

/** `POST /findings/:id/eval-case` — the server derives the expectation (accept/dismiss). */
export function useTurnIntoEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (findingId: string) => api.post<EvalCaseCreated>(`/findings/${findingId}/eval-case`),
    onSuccess: (res) => invalidateAgentEval(qc, res.case.owner_id),
  });
}

// ---- Case CRUD -------------------------------------------------------------

export function useEvalCases(agentId: string | null | undefined, opts?: { polling?: boolean }) {
  return useQuery({
    queryKey: evalKeys.cases(agentId ?? ""),
    queryFn: () => api.get<EvalCaseSummary[]>(`/agents/${agentId}/eval-cases`),
    enabled: !!agentId,
    refetchInterval: opts?.polling ? EVAL_POLL_MS : false,
  });
}

export function useCreateEvalCase(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: EvalCaseBodyInput) => api.post<EvalCaseSummary>(`/agents/${agentId}/eval-cases`, body),
    onSuccess: () => invalidateAgentEval(qc, agentId),
  });
}

export function useUpdateEvalCase(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: EvalCasePatch }) =>
      api.patch<EvalCaseSummary>(`/eval-cases/${id}`, patch),
    onSuccess: () => invalidateAgentEval(qc, agentId),
  });
}

export function useDeleteEvalCase(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: true }>(`/eval-cases/${id}`),
    onSuccess: () => invalidateAgentEval(qc, agentId),
  });
}

/** Run ONE case on the agent's current config (no suite run). 422 `llm_unavailable` when no key. */
export function useRunEvalCase(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (caseId: string) => api.post<EvalRunResult>(`/eval-cases/${caseId}/run`),
    onSuccess: () => qc.invalidateQueries({ queryKey: evalKeys.cases(agentId) }),
  });
}

// ---- Suite runs ------------------------------------------------------------

/**
 * `POST /agents/:id/eval-runs` — 202 with the run. A missing LLM key still answers
 * 202 with a `failed` run (reason `llm_unavailable`); the caller shows it.
 */
export function useStartSuite(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<EvalSuiteRun>(`/agents/${agentId}/eval-runs`),
    onSuccess: () => invalidateAgentEval(qc, agentId),
  });
}

/**
 * Runs `cb` once when `running` flips true → false (a suite just finished), so
 * sibling queries (case rows, tiles, history) pick up the final aggregates.
 */
function useOnRunningEnd(running: boolean, cb: () => void) {
  const prev = React.useRef(running);
  const cbRef = React.useRef(cb);
  cbRef.current = cb;
  React.useEffect(() => {
    if (prev.current && !running) cbRef.current();
    prev.current = running;
  }, [running]);
}

/** Suite-run history, newest first; polls while any run is `running`. */
export function useAgentSuiteRuns(agentId: string | null | undefined) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: evalKeys.suiteRuns(agentId ?? ""),
    queryFn: () => api.get<EvalSuiteRun[]>(`/agents/${agentId}/eval-runs`),
    enabled: !!agentId,
    refetchInterval: (q) => (q.state.data?.some((r) => r.status === "running") ? EVAL_POLL_MS : false),
  });
  useOnRunningEnd(!!query.data?.some((r) => r.status === "running"), () => invalidateAgentEval(qc, agentId ?? ""));
  return query;
}

/** Poll target: a suite run + its case results. Polls while `running`, stops on a terminal status. */
export function useSuiteRun(id: string | null | undefined) {
  return useQuery({
    queryKey: evalKeys.suiteRun(id ?? ""),
    queryFn: () => api.get<EvalSuiteRunDetail>(`/eval-suite-runs/${id}`),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data?.status === "running" ? EVAL_POLL_MS : false),
  });
}

// ---- Dashboards + compare --------------------------------------------------

export function useEvalDashboard() {
  return useQuery({
    queryKey: evalKeys.workspaceDashboard,
    queryFn: () => api.get<EvalWorkspaceDashboard>("/eval/dashboard"),
    refetchInterval: (q) => (q.state.data?.recent_runs.some((r) => r.status === "running") ? EVAL_POLL_MS : false),
  });
}

export function useAgentEvalDashboard(agentId: string | null | undefined, days?: number) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: [...evalKeys.agentDashboard(agentId ?? ""), days ?? null],
    queryFn: () =>
      api.get<EvalDashboard>(`/agents/${agentId}/eval-dashboard${days ? `?days=${days}` : ""}`),
    enabled: !!agentId,
    refetchInterval: (q) => (q.state.data?.recent_runs.some((r) => r.status === "running") ? EVAL_POLL_MS : false),
  });
  useOnRunningEnd(!!query.data?.recent_runs.some((r) => r.status === "running"), () =>
    invalidateAgentEval(qc, agentId ?? ""),
  );
  return query;
}

export function useCompareRuns(a: string | null | undefined, b: string | null | undefined) {
  return useQuery({
    queryKey: evalKeys.compare(a ?? "", b ?? ""),
    queryFn: () => api.get<EvalCompare>(`/eval-suite-runs/compare?a=${a}&b=${b}`),
    enabled: !!a && !!b,
  });
}

// ---- Run all agents (client loop; no dedicated server route) ----------------

export interface RunAllOutcome {
  started: string[];
  alreadyRunning: string[];
  failed: { agentId: string; code?: string }[];
}

/** Starts one suite per given agent id; a 409 (`suite_running`) is not a failure. */
export function useRunAllAgents() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (agentIds: string[]): Promise<RunAllOutcome> => {
      const settled = await Promise.allSettled(
        agentIds.map((id) => api.post<EvalSuiteRun>(`/agents/${id}/eval-runs`)),
      );
      const out: RunAllOutcome = { started: [], alreadyRunning: [], failed: [] };
      settled.forEach((r, i) => {
        const agentId = agentIds[i]!;
        if (r.status === "fulfilled") out.started.push(agentId);
        else if (r.reason instanceof ApiError && r.reason.status === 409) out.alreadyRunning.push(agentId);
        else out.failed.push({ agentId, code: r.reason instanceof ApiError ? r.reason.code : undefined });
      });
      return out;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["eval-suite-runs"] });
      qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
      qc.invalidateQueries({ queryKey: evalKeys.workspaceDashboard });
    },
  });
}

// ---- Promote vX ------------------------------------------------------------

/**
 * Re-apply a run's `config_snapshot` to its agent: `PUT /agents/:id` for the
 * config fields (creates a new agent version) and `POST /agents/:id/skills` to
 * restore the ordered skill set. Two calls, deliberately sequential.
 */
export function usePromoteSnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ agentId, config }: { agentId: string; config: AgentVersionConfig }) => {
      const agent = await api.put<Agent>(`/agents/${agentId}`, {
        provider: config.provider,
        model: config.model,
        system_prompt: config.system_prompt,
        output_schema: config.output_schema ?? null,
        strategy: config.strategy,
        ci_fail_on: config.ci_fail_on,
        repo_intel: config.repo_intel,
      });
      await api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, { skill_ids: config.skills });
      return agent;
    },
    onSuccess: (_a, { agentId }) => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.invalidateQueries({ queryKey: ["agent", agentId] });
      qc.invalidateQueries({ queryKey: ["agent-skills", agentId] });
      invalidateAgentEval(qc, agentId);
    },
  });
}
