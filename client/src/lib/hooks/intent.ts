/* hooks/intent.ts — React Query hooks for the Intent Layer (PR-page Intent
   card). Mirrors hooks/conventions.ts's extract-and-invalidate shape. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PrIntentRecord } from "@devdigest/shared";

/** Read-only: the persisted Intent for a PR (or null before it's computed). */
export function usePrIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["intent", prId],
    queryFn: () => api.get<PrIntentRecord | null>(`/pulls/${prId}/intent`),
    enabled: !!prId,
  });
}

/** Always recomputes + persists (the PR page's "Re-evaluate" button). */
export function useExtractIntent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (prId: string) => api.post<PrIntentRecord>(`/pulls/${prId}/intent/extract`),
    onSuccess: (_data, prId) => {
      qc.invalidateQueries({ queryKey: ["intent", prId] });
    },
  });
}
