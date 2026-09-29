/* hooks/context.ts — React Query hooks for project context (SPEC-01):
     GET /repos/:id/context             → SpecFileList
     GET /repos/:id/context/preview     → SpecPreview
     GET|PUT /agents/:id/context        → { paths }
     GET|PUT /skills/:id/context        → { paths }
   The effective/inherited list is computed client-side (lib/context-paths). */
"use client";

import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { effectivePaths, inheritedOnly } from "../context-paths";
import { useAgentSkillLinks } from "./agents";
import { useSkills } from "./skills";
import type { SpecFileList, SpecPreview, AttachContextBody } from "../types";

interface AttachedPaths {
  paths: string[];
}

export function useContextFiles(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["context", repoId],
    queryFn: () => api.get<SpecFileList>(`/repos/${repoId}/context`),
    enabled: !!repoId,
  });
}

export function useContextPreview(repoId: string | null | undefined, path: string | null) {
  return useQuery({
    queryKey: ["context-preview", repoId, path],
    queryFn: () => api.get<SpecPreview>(`/repos/${repoId}/context/preview?path=${encodeURIComponent(path!)}`),
    enabled: !!repoId && !!path,
  });
}

export type ContextOwnerKind = "agents" | "skills";

/** Attached doc paths of one agent/skill, ordered. */
export function useAttachedContext(kind: ContextOwnerKind, id: string | null | undefined) {
  return useQuery({
    queryKey: ["context-attached", kind, id],
    queryFn: () => api.get<AttachedPaths>(`/${kind}/${id}/context`),
    enabled: !!id,
  });
}

/** Replace the full ordered attached list of an agent/skill. */
export function useSetAttachedContext(kind: ContextOwnerKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, paths }: { id: string } & AttachContextBody) =>
      api.put<AttachedPaths>(`/${kind}/${id}/context`, { paths }),
    onSuccess: (data, { id }) => {
      qc.setQueryData(["context-attached", kind, id], data);
      // used_by_agents counts change with every attach.
      qc.invalidateQueries({ queryKey: ["context"] });
    },
  });
}

/** Paths an agent inherits from its enabled linked skills (not its own). */
export function useInheritedContext(agentId: string, ownPaths: readonly string[]) {
  const { data: links } = useAgentSkillLinks(agentId);
  const { data: skills } = useSkills();
  const enabledLinked = (links ?? [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((l) => (skills ?? []).find((sk) => sk.id === l.skill_id))
    .filter((sk): sk is NonNullable<typeof sk> => !!sk && sk.enabled);
  const results = useQueries({
    queries: enabledLinked.map((sk) => ({
      queryKey: ["context-attached", "skills", sk.id],
      queryFn: () => api.get<AttachedPaths>(`/skills/${sk.id}/context`),
    })),
  });
  const perSkill = results.map((r) => r.data?.paths ?? []);
  return {
    inherited: inheritedOnly(ownPaths, perSkill),
    effective: effectivePaths(ownPaths, perSkill),
    isLoading: results.some((r) => r.isLoading),
  };
}
