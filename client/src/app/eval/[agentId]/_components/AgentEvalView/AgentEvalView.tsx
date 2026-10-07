/* AgentEvalView — /eval/[agentId] (SPEC-04 AC-27): back link, agent switcher,
   30-day window, Run eval (N), regression alert, metric tiles + trend chart and
   the recent-runs table (max 2 checkboxes → Compare). */
"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Icon, LineChart, SelectInput, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { MetricTile } from "@/components/eval/MetricTile";
import { chartYRange, definedSeries } from "@/components/eval/format";
import { suiteReasonKey } from "@/components/eval/reasons";
import { ApiError } from "@/lib/api";
import { useAgent, useAgents } from "@/lib/hooks/agents";
import { useAgentEvalDashboard, useStartSuite } from "@/lib/hooks/eval";
import { DEFAULT_WINDOW_DAYS, MAX_COMPARE, WINDOW_OPTIONS } from "@/app/eval/constants";
import { orderPair, toggleSelection } from "@/app/eval/helpers";
import { CompareRunsModal } from "../CompareRunsModal";
import { RunsTable } from "./RunsTable";
import { s } from "./styles";

export function AgentEvalView({ agentId }: { agentId: string }) {
  const t = useTranslations("eval");
  const router = useRouter();
  const [days, setDays] = React.useState<number>(DEFAULT_WINDOW_DAYS);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [comparing, setComparing] = React.useState(false);
  const { data: agent, isError: agentError } = useAgent(agentId);
  const { data: agents } = useAgents();
  const dash = useAgentEvalDashboard(agentId, days);
  const start = useStartSuite(agentId);

  const crumb = [
    { label: t("page.crumbSkillsLab") },
    { label: t("page.crumbEvalDashboard"), href: "/eval" },
    { label: agent?.name ?? t("page.crumbEvals") },
  ];

  if (agentError) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState fullScreen title={t("agentPage.loadAgentError")} body={t("agentPage.loadAgentErrorBody")} />
      </AppShell>
    );
  }

  const d = dash.data;
  const runs = d?.recent_runs ?? [];
  const running = runs.some((r) => r.status === "running") || start.isPending;
  const latest = runs[0];
  const trend = d?.trend ?? [];
  const startError = start.error instanceof ApiError ? start.error : null;
  const pair = orderPair(runs, selected);

  // Chart points need all three metrics; the table below lists every run.
  const plotted = trend.filter((p) => p.recall != null && p.precision != null && p.citation_accuracy != null);
  const series = [
    { name: t("dashboard.legend.recall"), color: "var(--accent)", data: plotted.map((p) => p.recall as number) },
    { name: t("dashboard.legend.precision"), color: "var(--ok)", data: plotted.map((p) => p.precision as number) },
    { name: t("dashboard.legend.citation"), color: "var(--warn)", data: plotted.map((p) => p.citation_accuracy as number) },
  ];
  const range = chartYRange(series.flatMap((x) => x.data));

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <Link href="/eval" style={s.back}>{t("agentPage.back")}</Link>

        <div style={s.head}>
          <Icon.Cpu size={18} style={{ color: "var(--accent)" }} aria-hidden="true" />
          <h1 style={s.h1}>{agent?.name ?? t("dashboard.defaultTitle")}</h1>
          {agent && <Badge color="var(--text-secondary)" mono>{agent.provider}/{agent.model}</Badge>}
          <span style={s.spacer} />
          <label style={s.select}>
            <span style={s.srOnly}>{t("agentPage.switchAgent")}</span>
            <SelectInput
              mono={false}
              value={agentId}
              options={(agents ?? []).map((a) => ({ value: a.id, label: a.name }))}
              onChange={(id) => router.push(`/eval/${id}`)}
            />
          </label>
          <label style={{ width: 130 }}>
            <span style={s.srOnly}>{t("agentPage.window")}</span>
            <SelectInput
              mono={false}
              value={String(days)}
              options={WINDOW_OPTIONS.map((n) => ({ value: String(n), label: t("agentPage.windowDays", { count: n }) }))}
              onChange={(v) => setDays(Number(v))}
            />
          </label>
          <Button kind="primary" icon="Play" loading={running} disabled={!d || d.cases_total === 0} onClick={() => start.mutate()}>
            {running ? t("dashboard.running") : t("dashboard.runEval", { count: d?.cases_total ?? 0 })}
          </Button>
        </div>

        {d && (
          <p style={s.sub}>
            {t("dashboard.casesSummary", { count: d.cases_total, runs: runs.length })}{" "}
            <Link href={`/agents/${agentId}?tab=evals`} style={s.back}>{t("dashboard.configure")}</Link>
          </p>
        )}

        <div aria-live="polite">
          {d?.alert && (
            <div role="alert" style={s.banner("warn")}>
              <Icon.AlertTriangle size={16} style={{ color: "var(--warn)", flexShrink: 0 }} aria-hidden="true" />
              <span>{d.alert}</span>
            </div>
          )}
          {latest?.status === "failed" && (
            <div role="alert" style={s.banner("crit")}>
              <Icon.AlertTriangle size={16} style={{ color: "var(--crit)", flexShrink: 0 }} aria-hidden="true" />
              <span>{t(`common.suiteFailed.${suiteReasonKey(latest.reason)}`)}</span>
            </div>
          )}
          {startError && (
            <div role="alert" style={s.banner("warn")}>
              {startError.code === "no_cases" ? t("evalsTab.startErrors.no_cases") : startError.status === 409 ? t("evalsTab.startErrors.suite_running") : startError.message}
            </div>
          )}
        </div>

        {dash.isLoading ? (
          <Skeleton height={300} />
        ) : dash.isError || !d ? (
          <ErrorState title={t("agentPage.loadError")} onRetry={() => dash.refetch()} />
        ) : (
          <>
            <div style={s.tiles}>
              <MetricTile label={t("dashboard.metrics.recall")} value={d.current.recall} delta={d.delta.recall} trend={definedSeries(trend.map((p) => p.recall))} color="var(--accent)" />
              <MetricTile label={t("dashboard.metrics.precision")} value={d.current.precision} delta={d.delta.precision} trend={definedSeries(trend.map((p) => p.precision))} color="var(--ok)" />
              <MetricTile label={t("dashboard.metrics.citationAccuracy")} value={d.current.citation_accuracy} delta={d.delta.citation_accuracy} trend={definedSeries(trend.map((p) => p.citation_accuracy))} color="var(--warn)" />
            </div>

            <section>
              <h2 style={s.h2}>{t("dashboard.metricTrend")}</h2>
              {plotted.length < 2 ? (
                <p style={s.sub}>{t("agentPage.notEnoughRuns")}</p>
              ) : (
                <>
                  <div style={s.legend}>
                    {series.map((x) => (
                      <span key={x.name} style={{ color: x.color }}>● {x.name}</span>
                    ))}
                  </div>
                  <div aria-hidden="true">
                    <LineChart series={series} yMin={range.yMin} yMax={range.yMax} w={900} h={220} />
                  </div>
                </>
              )}
            </section>

            <section>
              <div style={{ ...s.head, marginBottom: 8 }}>
                <h2 style={s.h2}>{t("dashboard.recentRuns")}</h2>
                <span style={s.spacer} />
                <Button kind="secondary" size="sm" icon="GitCompare" disabled={!pair} onClick={() => setComparing(true)}>
                  {t("agentPage.compare")}
                </Button>
              </div>
              {runs.length === 0 ? (
                <EmptyState icon="FlaskConical" title={t("agentPage.noRunsTitle")} body={t("dashboard.noRuns")} />
              ) : (
                <RunsTable runs={runs} selected={selected} onToggle={(id) => setSelected((sel) => toggleSelection(sel, id, MAX_COMPARE))} />
              )}
            </section>
          </>
        )}

        {comparing && pair && (
          <CompareRunsModal a={pair[0]} b={pair[1]} agentId={agentId} onClose={() => setComparing(false)} />
        )}
      </div>
    </AppShell>
  );
}
