/* hooks/onboarding.ts — React Query hooks for the Onboarding Tour (SPEC-02):
     GET  /repos/:id/onboarding           → Onboarding | null
     POST /repos/:id/onboarding/generate  → Onboarding (201)
   Generation failures carry a machine-readable reason at ApiError.details.reason. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import type { Onboarding } from "@devdigest/shared";

export const ONBOARDING_ERROR_REASONS = [
  "generation_in_progress",
  "no_clone",
  "index_unavailable",
  "llm_unavailable",
] as const;
export type OnboardingErrorReason = (typeof ONBOARDING_ERROR_REASONS)[number];

/** Extract the known machine-readable reason from a failed generate call, if any. */
export function onboardingErrorReason(error: unknown): OnboardingErrorReason | null {
  if (!(error instanceof ApiError)) return null;
  const reason = (error.details as { reason?: unknown } | null | undefined)?.reason;
  return ONBOARDING_ERROR_REASONS.find((r) => r === reason) ?? null;
}

const key = (repoId: string | null | undefined) => ["onboarding", repoId] as const;

/** Current stored tour for the repo, or `null` when none exists yet. */
export function useOnboarding(repoId: string | null | undefined) {
  return useQuery({
    queryKey: key(repoId),
    queryFn: () => api.get<Onboarding | null>(`/repos/${repoId}/onboarding`),
    enabled: !!repoId,
  });
}

/** Generate (or regenerate) the tour. On failure the cached previous tour stays untouched. */
export function useGenerateOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) => api.post<Onboarding>(`/repos/${repoId}/onboarding/generate`),
    onSuccess: (data, repoId) => {
      qc.setQueryData(key(repoId), data);
    },
  });
}
