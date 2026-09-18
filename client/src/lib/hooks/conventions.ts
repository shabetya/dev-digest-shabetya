/* hooks/conventions.ts — React Query hooks for the Conventions Extractor
   (Skills Lab → Conventions). Mirrors reviews.ts's finding-action shape. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { ConventionCandidate } from "@devdigest/shared";

export function useConventionCandidates(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["conventions", repoId],
    queryFn: () => api.get<ConventionCandidate[]>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

/** Sample + LLM-propose + verify + persist candidates for this repo. */
export function useExtractConventions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) =>
      api.post<ConventionCandidate[]>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (_data, repoId) => {
      qc.invalidateQueries({ queryKey: ["conventions", repoId] });
    },
  });
}

export type ConventionActionKind = "accept" | "reject";

export function useConventionAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      candidateId,
      action,
    }: {
      candidateId: string;
      action: ConventionActionKind;
      repoId?: string;
    }) => api.post<ConventionCandidate>(`/conventions/${candidateId}/${action}`),
    onSuccess: (_data, { repoId }) => {
      if (repoId) qc.invalidateQueries({ queryKey: ["conventions", repoId] });
    },
  });
}
