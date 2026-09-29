/* hooks/brief.ts — React Query hooks for the PR Why + Risk brief (SPEC-03):
     GET  /pulls/:id/brief           → PrBrief | null
     POST /pulls/:id/brief/generate  → PrBrief (201)
   Generation failures carry a machine-readable reason at ApiError.details.reason. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import type { PrBrief } from "@devdigest/shared";

export const BRIEF_ERROR_REASONS = [
  "llm_unavailable",
  "no_files",
  "generation_failed",
  "generation_in_progress",
] as const;
export type BriefErrorReason = (typeof BRIEF_ERROR_REASONS)[number];

/** Extract the known machine-readable reason from a failed generate call, if any. */
export function briefErrorReason(error: unknown): BriefErrorReason | null {
  if (!(error instanceof ApiError)) return null;
  const reason = (error.details as { reason?: unknown } | null | undefined)?.reason;
  return BRIEF_ERROR_REASONS.find((r) => r === reason) ?? null;
}

const key = (prId: string | null | undefined) => ["pr-brief", prId] as const;

/** Stored brief for the PR, or `null` when none exists yet. Never generates. */
export function useBrief(prId: string | null | undefined) {
  return useQuery({
    queryKey: key(prId),
    queryFn: () => api.get<PrBrief | null>(`/pulls/${prId}/brief`),
    enabled: !!prId,
  });
}

/** Generate (or regenerate) the brief. On failure the cached previous brief stays untouched. */
export function useGenerateBrief() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (prId: string) => api.post<PrBrief>(`/pulls/${prId}/brief/generate`),
    onSuccess: (data, prId) => {
      qc.setQueryData(key(prId), data);
    },
  });
}
