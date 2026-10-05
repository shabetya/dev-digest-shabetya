/* ContextView — read-only list of the repo's Markdown docs, grouped by
   top-level folder, with tokens, "Used by N agents" and a Preview modal.
   There are deliberately no edit controls (AC-4). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { ContextPreviewModal } from "@/components/context-docs/ContextPreviewModal";
import { groupFiles } from "@/components/context-docs/helpers";
import { useContextFiles } from "@/lib/hooks/context";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { s } from "./styles";

const SKELETON_ROWS = 4;

export function ContextView({ repoId }: { repoId: string }) {
  const t = useTranslations("context");
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data, isLoading, isError, refetch } = useContextFiles(repoId);
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);

  const repoName = activeRepo?.full_name ?? repoId;
  const crumb = [{ label: repoName, mono: true }, { label: t("crumb") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const files = data?.files ?? [];
  const byPath = new Map(files.map((f) => [f.path, f]));

  return (
    <AppShell crumb={crumb}>
      <div style={s.pageHeader}>
        <h1 style={s.pageTitle}>{t("title")}</h1>
        <p style={s.pageSubtitle}>{t("subtitle")}</p>
      </div>
      <div style={s.content}>
        {isLoading ? (
          Array.from({ length: SKELETON_ROWS }).map((_, i) => <Skeleton key={i} height={44} />)
        ) : isError || !data ? (
          <ErrorState title={t("loadError")} onRetry={() => refetch()} />
        ) : data.reason === "no_clone" ? (
          <EmptyState icon="FileText" title={t("noClone.title")} body={t("noClone.body")} />
        ) : files.length === 0 ? (
          <EmptyState icon="FileText" title={t("empty.title")} body={t("empty.body")} />
        ) : (
          <>
            {data.truncated && <div style={s.note}>{t("truncated", { count: files.length })}</div>}
            {groupFiles(files).map(({ group, files: list }) => (
              <section key={group} style={s.group}>
                <h2 style={s.groupTitle}>{group}</h2>
                {list.map((f) => (
                  <div key={f.path} style={s.row}>
                    <span className="mono" style={s.path}>
                      {f.path}
                    </span>
                    {f.used_by_agents > 0 && (
                      <Badge color="var(--ok)" bg="var(--ok-bg)">
                        {t("attached")}
                      </Badge>
                    )}
                    {f.reason && <Badge color="var(--warn, #f59e0b)">{t(`skipReason.${f.reason}`)}</Badge>}
                    <span style={s.meta}>{t("usedBy", { count: f.used_by_agents })}</span>
                    <span style={s.meta}>{t("tokens", { count: f.tokens })}</span>
                    <Button kind="ghost" size="sm" icon="Eye" onClick={() => setPreviewPath(f.path)}>
                      {t("preview")}
                    </Button>
                  </div>
                ))}
              </section>
            ))}
          </>
        )}
      </div>
      {previewPath && (
        <ContextPreviewModal
          repoId={repoId}
          path={previewPath}
          file={byPath.get(previewPath)}
          attached={(byPath.get(previewPath)?.used_by_agents ?? 0) > 0}
          onClose={() => setPreviewPath(null)}
        />
      )}
    </AppShell>
  );
}
