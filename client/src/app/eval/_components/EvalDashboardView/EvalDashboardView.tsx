/* EvalDashboardView — /eval (SPEC-04 AC-27): Run all agents, per-agent rows
   (model chip, last run, sparkline, metrics) linking to /eval/[agentId], and the
   workspace-wide recent runs table. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Skeleton, Sparkline } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { definedSeries, formatCost, formatPct, formatRanAt } from "@/components/eval/format";
import { useEvalDashboard, useRunAllAgents } from "@/lib/hooks/eval";
import { planRunAll } from "@/app/eval/helpers";
import { RecentRunsTable } from "./RecentRunsTable";
import { s } from "./styles";

export function EvalDashboardView() {
  const t = useTranslations("eval");
  const { data, isLoading, isError, refetch } = useEvalDashboard();
  const runAll = useRunAllAgents();
  const crumb = [{ label: t("page.crumbSkillsLab") }, { label: t("page.crumbEvalDashboard") }];

  const agents = data?.agents ?? [];
  const running = !!data?.recent_runs.some((r) => r.status === "running") || runAll.isPending;
  const plan = planRunAll(agents);

  const onRunAll = () => {
    if (plan.agentIds.length === 0) return;
    if (plan.needsConfirm && !window.confirm(t("workspace.confirmRunAll", { cases: plan.totalCases, agents: plan.agentIds.length }))) return;
    runAll.mutate(plan.agentIds);
  };

  const nameOf = (id: string) => agents.find((a) => a.agent_id === id)?.agent_name ?? id;
  const outcome = runAll.data;

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.head}>
          <div>
            <h1 style={s.h1}>{t("dashboard.defaultTitle")}</h1>
            <p style={s.sub}>{t("workspace.subtitle")}</p>
          </div>
          <Button kind="primary" icon="Play" loading={running} disabled={plan.agentIds.length === 0} onClick={onRunAll}>
            {running ? t("dashboard.running") : t("workspace.runAll")}
          </Button>
        </div>

        <div aria-live="polite">
          {outcome && (
            <p style={s.notice}>
              {t("workspace.runAllResult", { started: outcome.started.length, running: outcome.alreadyRunning.length, failed: outcome.failed.length })}
            </p>
          )}
          {plan.noCases.length > 0 && (
            <p style={s.sub}>{t("workspace.noCasesList", { names: plan.noCases.join(", ") })}</p>
          )}
          {outcome && outcome.failed.length > 0 && (
            <p role="alert" style={s.err}>
              {outcome.failed.map((f) => `${nameOf(f.agentId)}: ${f.code ?? t("workspace.runFailed")}`).join(" · ")}
            </p>
          )}
        </div>

        {isLoading ? (
          <Skeleton height={160} />
        ) : isError || !data ? (
          <ErrorState title={t("workspace.loadError")} onRetry={() => refetch()} />
        ) : agents.length === 0 ? (
          <EmptyState icon="Cpu" title={t("workspace.noAgentsTitle")} body={t("workspace.noAgentsBody")} />
        ) : (
          <ul style={s.rows} aria-busy={running}>
            {agents.map((a) => {
              const spark = definedSeries(a.sparkline.map((p) => p.pass_rate));
              const live = data.recent_runs.some((r) => r.agent_id === a.agent_id && r.status === "running");
              return (
                <li key={a.agent_id} style={{ listStyle: "none" }}>
                  <Link href={`/eval/${a.agent_id}`} style={s.row}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={s.rowTop}>
                        <span style={s.name}>{a.agent_name}</span>
                        <Badge color="var(--text-secondary)" mono>{a.provider}/{a.model}</Badge>
                        {live && <Badge color="var(--accent)">{t("workspace.running")}</Badge>}
                      </div>
                      <div style={s.sub}>
                        {a.latest
                          ? t("workspace.lastRun", { version: a.latest.agent_version, at: formatRanAt(a.latest.ran_at), passed: a.latest.cases_passed, total: a.latest.cases_total })
                          : a.cases_total > 0
                            ? t("workspace.neverRun", { cases: a.cases_total })
                            : t("workspace.noCases")}
                      </div>
                    </div>
                    <span aria-hidden="true">{spark.length > 1 && <Sparkline data={spark} w={80} h={24} />}</span>
                    <Metric label={t("dashboard.table.recall")} value={formatPct(a.latest?.recall)} />
                    <Metric label={t("dashboard.table.precision")} value={formatPct(a.latest?.precision)} />
                    <Metric label={t("dashboard.table.citation")} value={formatPct(a.latest?.citation_accuracy)} />
                    <Metric label={t("dashboard.table.cost")} value={formatCost(a.latest?.cost_usd)} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <h2 style={s.h2}>{t("workspace.recentRuns")}</h2>
        <RecentRunsTable runs={data?.recent_runs ?? []} loading={isLoading} />
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 70, textAlign: "right" }}>
      <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{label}</div>
      <div className="tnum" style={{ fontSize: 15, fontWeight: 600 }}>{value}</div>
    </div>
  );
}
