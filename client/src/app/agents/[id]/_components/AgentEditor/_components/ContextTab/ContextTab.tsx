/* ContextTab (agent) — own attached project-context docs + read-only docs
   inherited from enabled linked skills (effective list computed client-side). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ContextAttachPanel } from "@/components/context-docs/ContextAttachPanel";
import { useAttachedContext, useInheritedContext, useSetAttachedContext } from "@/lib/hooks/context";

export function ContextTab({ agent }: { agent: Agent }) {
  const t = useTranslations("context");
  const { data, isLoading, isError, refetch } = useAttachedContext("agents", agent.id);
  const own = data?.paths ?? [];
  const { inherited } = useInheritedContext(agent.id, own);
  const save = useSetAttachedContext("agents");

  if (isLoading) return <Skeleton height={48} />;
  if (isError || !data) return <ErrorState title={t("tab.loadError")} onRetry={() => refetch()} />;
  return (
    <ContextAttachPanel
      key={`${agent.id}:${own.join("\n")}`}
      paths={own}
      inherited={inherited}
      saving={save.isPending}
      saved={save.isSuccess}
      onSave={(paths) => save.mutate({ id: agent.id, paths })}
    />
  );
}
