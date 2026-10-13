/* MultiAgentReviewView — the Multi-Agent Review results page (AC-12..18).
   Columns view (live status per agent) and Tabs+detail view (one tab per
   agent + its findings' full detail), both driven by the ONE combined
   useMultiAgentRun() response — polling while any column is `running`, with
   SSE layered on top via the promoted RunTraceDrawer's own existing
   Live-log tab. Exactly one RunTraceDrawer instance is ever mounted
   (page-level `selectedRunId`, mirroring usePrDetailPage's `?trace=`
   pattern) regardless of which column/tab's "View trace" fires. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton, Tabs } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import RunTraceDrawer from "@/components/run-trace-drawer";
import { useMultiAgentRun } from "@/lib/hooks/multi-agent";
import { ApiError } from "@/lib/api";
import { formatCost } from "@/lib/format";
import { ColumnCard } from "./_components/ColumnCard";
import { ConflictsPanel } from "./_components/ConflictsPanel";
import { FindingDetailPanel } from "./_components/FindingDetailPanel";
import { VIEW_MODE_TABS } from "./constants";
import { defaultColumn, findColumn } from "./helpers";
import { s } from "./styles";

export function MultiAgentReviewView({ multiRunId }: { multiRunId: string }) {
  const t = useTranslations("multiAgentReview.results");
  const router = useRouter();
  const search = useSearchParams();
  const { data, isLoading, isError, error, refetch } = useMultiAgentRun(multiRunId);

  const [viewMode, setViewMode] = React.useState<string>("columns");
  const [activeAgentId, setActiveAgentId] = React.useState<string | null>(null);

  const traceRunId = search.get("trace");
  const setTraceRunId = React.useCallback(
    (runId: string | null) => {
      const sp = new URLSearchParams(search.toString());
      if (runId == null) sp.delete("trace");
      else sp.set("trace", runId);
      router.replace(`/multi-agent-review/${multiRunId}${sp.toString() ? `?${sp.toString()}` : ""}`);
    },
    [search, router, multiRunId],
  );

  const columns = data?.columns ?? [];
  const activeColumn = findColumn(columns, activeAgentId) ?? defaultColumn(columns);
  const traceColumn = columns.find((c) => c.run_id === traceRunId) ?? null;

  if (isLoading) {
    return (
      <AppShell crumb={[{ label: t("breadcrumbLab") }, { label: t("breadcrumb") }]}>
        <div style={s.loadingWrap}>
          <Skeleton height={28} width={420} />
          <Skeleton height={200} />
        </div>
      </AppShell>
    );
  }

  if (isError || !data) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <AppShell crumb={[{ label: t("breadcrumbLab") }, { label: t("breadcrumb") }]}>
        <ErrorState
          fullScreen
          title={t("loadError")}
          body={notFound ? t("notFound") : error instanceof ApiError ? error.message : undefined}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={[{ label: t("breadcrumbLab") }, { label: t("breadcrumb") }]}>
      <div style={s.page}>
        <div style={s.headerRow}>
          <h1 style={s.h1}>
            {t("breadcrumbLab")}
            {data.pr_number != null ? ` · PR #${data.pr_number}` : ""}
          </h1>
          <span style={s.summary}>
            {data.agent_count} agents · {formatCost(data.total_cost_usd)}
          </span>
        </div>

        <Tabs tabs={VIEW_MODE_TABS} value={viewMode} onChange={setViewMode} pad="0" />

        {viewMode === "columns" ? (
          <div style={s.columnsGrid}>
            {columns.map((c) => (
              <ColumnCard key={c.agent_id} column={c} onViewTrace={setTraceRunId} />
            ))}
          </div>
        ) : (
          <div style={s.tabsBody}>
            <Tabs
              tabs={columns.map((c) => ({
                key: c.agent_id,
                label: c.agent_name,
                count: c.score ?? undefined,
              }))}
              value={activeColumn?.agent_id ?? ""}
              onChange={setActiveAgentId}
            />
            {activeColumn?.status === "deleted" && <ErrorState title={t("runDeleted")} />}
            {activeColumn && activeColumn.status !== "deleted" && activeColumn.findings.length === 0 && (
              <div style={s.summary}>{t("noFindings")}</div>
            )}
            {activeColumn?.findings.map((f) => (
              <FindingDetailPanel key={f.id} finding={f} prId={data.pr_id} />
            ))}
          </div>
        )}

        {columns.length >= 2 && (
          <ConflictsPanel conflicts={data.conflicts} status={data.conflicts_status} />
        )}
      </div>

      {traceColumn?.run_id && (
        <RunTraceDrawer
          runId={traceColumn.run_id}
          agentName={traceColumn.agent_name}
          prNumber={data.pr_number}
          findings={[]}
          running={traceColumn.status === "running"}
          onClose={() => setTraceRunId(null)}
        />
      )}
    </AppShell>
  );
}
