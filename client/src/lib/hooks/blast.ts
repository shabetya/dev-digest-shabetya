/* hooks/blast.ts — React Query hook for the Blast Radius card (PR Overview
   tab). Read-only, pre-calculated impact map — mirrors useSmartDiff/
   usePrIntent's shape exactly. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { BlastRadiusResponse } from "@devdigest/shared";

/** The pre-calculated blast-radius impact map for a PR. */
export function useBlastRadius(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["blast", prId],
    queryFn: () => api.get<BlastRadiusResponse>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}
