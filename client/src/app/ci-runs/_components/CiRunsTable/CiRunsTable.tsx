/* CiRunsTable — /ci-runs (SPEC-05 AC-17): the global CI Runs page. Shows
   every CI-sourced run (repository, PR number, agent, verdict, findings
   count, cost, duration, link to the GH Actions job) with a status filter
   and a manual Refresh (pull-on-refresh ingestion, AC-15/16). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { CiRun, CiRunStatus } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { formatCost } from "@/components/eval/format";
import { useCiRuns, useRefreshCiRuns } from "@/lib/hooks/ci";
import { formatDuration, repoFromGithubUrl } from "./helpers";
import { s } from "./styles";

const STATUS_VALUES: readonly CiRunStatus[] = ["succeeded", "failed", "no_findings", "running"];

const NO_VALUE = "—";

export function CiRunsTable() {
  const t = useTranslations("ci");
  const [status, setStatus] = React.useState<string>("");
  const { data, isLoading, isError, refetch } = useCiRuns(status ? { status } : {});
  const refresh = useRefreshCiRuns();
  const crumb = [{ label: t("page.crumb") }];

  const runs = data ?? [];

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.head}>
          <div>
            <h1 style={s.h1}>{t("runs.title")}</h1>
            <p style={s.sub}>{t("runs.subtitle")}</p>
          </div>
          <Button kind="secondary" icon="RefreshCw" loading={refresh.isPending} onClick={() => refresh.mutate()}>
            {refresh.isPending ? t("runs.refreshing") : t("runs.refresh")}
          </Button>
        </div>

        <div style={s.filters}>
          <select
            aria-label={t("runs.filters.allStatuses")}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">{t("runs.filters.allStatuses")}</option>
            {STATUS_VALUES.map((v) => (
              <option key={v} value={v}>
                {t(`runs.status.${statusKey(v)}`)}
              </option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <Skeleton height={160} />
        ) : isError ? (
          <ErrorState title={t("runs.emptyTitle")} onRetry={() => refetch()} />
        ) : runs.length === 0 ? (
          <EmptyState icon="Play" title={t("runs.emptyTitle")} body={t("runs.emptyBody")} />
        ) : (
          <table style={s.table}>
            <thead>
              <tr>
                {(["timestamp", "pullRequest", "source", "findings", "cost", "duration", "status"] as const).map((k) => (
                  <th key={k} scope="col" style={s.th}>
                    {t(`runs.table.${k}`)}
                  </th>
                ))}
                <th scope="col" style={s.th}>
                  {t("runs.view")}
                </th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <CiRunRow key={r.id} run={r} t={t} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}

function statusKey(status: CiRunStatus): "succeeded" | "noFindings" | "failed" | "running" {
  if (status === "no_findings") return "noFindings";
  return status;
}

function CiRunRow({ run, t }: { run: CiRun; t: ReturnType<typeof useTranslations> }) {
  const repo = repoFromGithubUrl(run.github_url);
  const statusLabel =
    run.status && STATUS_VALUES.includes(run.status as CiRunStatus)
      ? t(`runs.status.${statusKey(run.status as CiRunStatus)}`)
      : NO_VALUE;
  return (
    <tr>
      <td style={s.td}>{run.ran_at ? new Date(run.ran_at).toLocaleString() : NO_VALUE}</td>
      <td style={s.td}>
        {repo ?? NO_VALUE}
        {run.pr_number != null ? ` #${run.pr_number}` : ""}
        {run.agent ? ` · ${run.agent}` : ""}
      </td>
      <td style={s.td}>{run.source ?? NO_VALUE}</td>
      <td style={s.td}>{run.findings_count ?? NO_VALUE}</td>
      <td style={s.td}>{formatCost(run.cost_usd)}</td>
      <td style={s.td}>{formatDuration(run.duration_s) ?? NO_VALUE}</td>
      <td style={s.td}>{statusLabel}</td>
      <td style={s.td}>
        {run.github_url ? (
          <a href={run.github_url} target="_blank" rel="noreferrer">
            {t("runs.view")}
          </a>
        ) : (
          NO_VALUE
        )}
      </td>
    </tr>
  );
}
