/* ContextTab (skill) — project-context docs attached to this skill; agents
   linking the skill inherit them. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ContextAttachPanel } from "@/components/context-docs/ContextAttachPanel";
import { useAttachedContext, useSetAttachedContext } from "@/lib/hooks/context";

export function ContextTab({ skill }: { skill: Skill }) {
  const t = useTranslations("context");
  const { data, isLoading, isError, refetch } = useAttachedContext("skills", skill.id);
  const save = useSetAttachedContext("skills");

  if (isLoading) return <Skeleton height={48} />;
  if (isError || !data) return <ErrorState title={t("tab.loadError")} onRetry={() => refetch()} />;
  return (
    <ContextAttachPanel
      key={`${skill.id}:${data.paths.join("\n")}`}
      paths={data.paths}
      saving={save.isPending}
      saved={save.isSuccess}
      onSave={(paths) => save.mutate({ id: skill.id, paths })}
    />
  );
}
