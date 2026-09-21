"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { usePullDetail, usePulls } from "@/lib/hooks";
import { usePrReviews, useCancelRun, usePrActiveRuns, usePrRuns, useDeleteRun } from "@/lib/hooks/reviews";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { buildPrDetailCrumb, flattenFindings, lethalTrifectaFindings } from "./helpers";

/**
 * Orchestration for the PR-detail route: resolves the PR's uuid, wires every
 * server-data hook the tabs need, owns the ?tab/?trace query-param state, and
 * derives the findings summary + breadcrumb. `page.tsx` only parses route
 * params; `PrDetailView` renders using what this hook returns.
 */
export function usePrDetailPage(repoId: string, number: string) {
  const search = useSearchParams();
  const router = useRouter();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);

  // The route is keyed by PR number, but every PR API is keyed by the row's
  // uuid — resolve number → uuid via the (cached) pulls list before fetching.
  const { data: pulls, isLoading: pullsLoading } = usePulls(repoId);
  const prId = pulls?.find((p) => p.number === Number(number))?.id ?? null;
  const { data: pr, isLoading: detailLoading, isError, error, refetch } = usePullDetail(prId);
  const isLoading = pullsLoading || (prId != null && detailLoading);

  const { data: reviews, refetch: refetchReviews } = usePrReviews(prId);

  // Live run tracking is SERVER-SOURCED (agent_runs status='running'): survives
  // navigation AND reload, and self-clears via polling when runs finish.
  const qc = useQueryClient();
  const { data: activeRuns } = usePrActiveRuns(prId);
  const { data: prRuns } = usePrRuns(prId);
  const deleteRun = useDeleteRun(prId);
  const liveRunIds = (activeRuns ?? []).map((r) => r.run_id);
  const reviewRunning = liveRunIds.length > 0;
  const cancel = useCancelRun();

  const invalidateActiveRuns = React.useCallback(() => {
    if (prId) qc.invalidateQueries({ queryKey: ["pr-active-runs", prId] });
  }, [prId, qc]);
  // When a run settles (done OR failed) refresh the full run history too, so a
  // just-failed run shows up in "Run history" immediately — no page reload.
  const invalidateRunHistory = React.useCallback(() => {
    if (prId) qc.invalidateQueries({ queryKey: ["pr-runs", prId] });
  }, [prId, qc]);

  const tab = search.get("tab") ?? "overview";
  const traceRunId = search.get("trace");
  const setParam = React.useCallback(
    (key: string, val: string | null) => {
      const sp = new URLSearchParams(search.toString());
      if (val == null) sp.delete(key);
      else sp.set(key, val);
      router.replace(`/repos/${repoId}/pulls/${number}${sp.toString() ? `?${sp.toString()}` : ""}`);
    },
    [search, router, repoId, number],
  );
  const setTab = React.useCallback((t: string) => setParam("tab", t), [setParam]);

  // Reviews come newest-first; each is its own run (grouped into accordions).
  const runs = React.useMemo(() => reviews ?? [], [reviews]);
  const allFindings = React.useMemo(() => flattenFindings(runs), [runs]);
  const lethalTrifecta = React.useMemo(() => lethalTrifectaFindings(allFindings), [allFindings]);
  const findingsCount = allFindings.length;

  const repoName = activeRepo?.full_name ?? repoId;
  // The real "owner/repo" (null until the repo is loaded) — used to build
  // github.com deep-links for the header and finding file references.
  const repoFullName = activeRepo?.full_name ?? null;
  const crumb = buildPrDetailCrumb(repoId, repoName, number);

  return {
    repoNotFound,
    isLoading,
    isError,
    error,
    pr,
    prId,
    refetch,
    tab,
    setTab,
    traceRunId,
    setParam,
    runs,
    prRuns,
    liveRunIds,
    reviewRunning,
    cancel,
    deleteRun,
    invalidateActiveRuns,
    invalidateRunHistory,
    refetchReviews,
    findingsCount,
    lethalTrifecta,
    repoFullName,
    crumb,
  };
}
