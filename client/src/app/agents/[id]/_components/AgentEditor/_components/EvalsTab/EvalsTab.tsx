/* EvalsTab (agent) — SPEC-04 AC-26: metric tiles with deltas, "N / M passing",
   Run all evals / New eval case, and the case rows. A running suite disables
   Run all (spinner), sets aria-busy and updates rows via polling. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent, EvalCaseSummary } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import {
  useAgentEvalDashboard,
  useAgentSuiteRuns,
  useDeleteEvalCase,
  useEvalCases,
  useRunEvalCase,
  useStartSuite,
  useSuiteRun,
} from "@/lib/hooks/eval";
import { MetricTile } from "@/components/eval/MetricTile";
import { definedSeries } from "@/components/eval/format";
import { CaseRow } from "./_components/CaseRow";
import { CaseEditorModal } from "./_components/CaseEditorModal";
import { suiteReasonKey } from "@/components/eval/reasons";
import { countPassing, runnableCount } from "./helpers";
import { s } from "./styles";

type Editing = { kind: "new" } | { kind: "edit"; c: EvalCaseSummary } | null;

export function EvalsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("eval");
  const runs = useAgentSuiteRuns(agent.id);
  const active = runs.data?.find((r) => r.status === "running");
  const cases = useEvalCases(agent.id, { polling: !!active });
  const dash = useAgentEvalDashboard(agent.id);
  const detail = useSuiteRun(active?.id);
  const start = useStartSuite(agent.id);
  const runCase = useRunEvalCase(agent.id);
  const del = useDeleteEvalCase(agent.id);
  const [editing, setEditing] = React.useState<Editing>(null);

  const list = cases.data ?? [];
  const running = !!active || start.isPending;
  const latest = runs.data?.[0];
  const showFailure = latest?.status === "failed";
  const startError = start.error instanceof ApiError ? start.error : null;
  const trend = dash.data?.trend ?? [];

  const onDelete = (c: EvalCaseSummary) => {
    if (window.confirm(t("evalsTab.confirmDelete", { name: c.name }))) del.mutate(c.id);
  };

  return (
    <div style={s.wrap}>
      <section aria-label={t("evalsTab.metricsTitle")}>
        <div style={{ ...s.sectionHead, marginBottom: 10 }}>
          <h2 style={s.h2}>{t("evalsTab.metricsTitle")}</h2>
          <span style={s.sub}>{t("evalsTab.metricsSubtitle")}</span>
          <span style={s.spacer} />
          <Link href={`/eval/${agent.id}`} style={s.link}>{t("evalsTab.viewDashboard")}</Link>
        </div>
        {dash.isLoading ? (
          <Skeleton height={86} />
        ) : (
          <div style={s.tiles}>
            <MetricTile label={t("dashboard.metrics.recall")} value={dash.data?.current.recall ?? null} delta={dash.data?.delta.recall} trend={definedSeries(trend.map((p) => p.recall))} color="var(--accent)" />
            <MetricTile label={t("dashboard.metrics.precision")} value={dash.data?.current.precision ?? null} delta={dash.data?.delta.precision} trend={definedSeries(trend.map((p) => p.precision))} color="var(--ok)" />
            <MetricTile label={t("dashboard.metrics.citationAccuracy")} value={dash.data?.current.citation_accuracy ?? null} delta={dash.data?.delta.citation_accuracy} trend={definedSeries(trend.map((p) => p.citation_accuracy))} color="var(--warn)" />
            <div role="group" aria-label={t("evalsTab.tracesPassed")} style={{ flex: 1, minWidth: 150, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 9, padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>{t("evalsTab.tracesPassed")}</div>
              <div className="tnum" style={{ fontSize: 28, fontWeight: 700, marginTop: 10 }}>
                {dash.data && dash.data.current.traces_total > 0
                  ? `${dash.data.current.traces_passed}/${dash.data.current.traces_total}`
                  : "—"}
              </div>
            </div>
          </div>
        )}
      </section>

      {showFailure && latest && (
        <div role="alert" style={s.banner("crit")}>
          <Icon.AlertTriangle size={16} style={{ color: "var(--crit)", flexShrink: 0 }} aria-hidden="true" />
          <span>{t(`common.suiteFailed.${suiteReasonKey(latest.reason)}`)}</span>
        </div>
      )}
      {startError && (
        <div role="alert" style={s.banner("warn")}>
          <Icon.AlertTriangle size={16} aria-hidden="true" />
          <span>
            {startError.code === "no_cases"
              ? t("evalsTab.startErrors.no_cases")
              : startError.status === 409
                ? t("evalsTab.startErrors.suite_running")
                : startError.message}
          </span>
        </div>
      )}

      <section aria-label={t("evalsTab.casesHeading")} aria-busy={running}>
        <div style={{ ...s.sectionHead, marginBottom: 10 }}>
          <h2 style={s.h2}>{t("evalsTab.casesHeading")}</h2>
          <span style={s.sub}>{t("evalsTab.passingSummary", { passing: countPassing(list), total: list.length })}</span>
          <span style={s.spacer} />
          <Button kind="secondary" size="sm" icon="Plus" onClick={() => setEditing({ kind: "new" })}>
            {t("evalsTab.newCase")}
          </Button>
          <Button
            kind="primary"
            size="sm"
            icon="Play"
            loading={running}
            disabled={runnableCount(list) === 0}
            onClick={() => start.mutate()}
          >
            {running ? t("evalsTab.runningAll") : t("evalsTab.runAll")}
          </Button>
        </div>
        <div aria-live="polite" style={{ ...s.sub, marginBottom: 8 }}>
          {active
            ? t("evalsTab.progress", { done: detail.data?.case_runs.length ?? 0, total: active.cases_total })
            : ""}
        </div>
        {cases.isLoading ? (
          <Skeleton height={120} />
        ) : cases.isError ? (
          <ErrorState title={t("evalsTab.loadError")} onRetry={() => cases.refetch()} />
        ) : list.length === 0 ? (
          <EmptyState icon="FlaskConical" title={t("evalsTab.emptyTitle")} body={t("evalsTab.emptyCases")} />
        ) : (
          <ul style={{ ...s.list, margin: 0, padding: 0 }}>
            {list.map((c) => (
              <CaseRow
                key={c.id}
                c={c}
                busy={runCase.isPending && runCase.variables === c.id}
                disabled={running}
                onRun={() => runCase.mutate(c.id)}
                onEdit={() => setEditing({ kind: "edit", c })}
                onDelete={() => onDelete(c)}
              />
            ))}
          </ul>
        )}
        {runCase.isError && (
          <div role="alert" style={{ ...s.banner("warn"), marginTop: 10 }}>
            {runCase.error instanceof ApiError && runCase.error.code === "llm_unavailable"
              ? t("common.suiteFailed.llm_unavailable")
              : runCase.error instanceof ApiError
                ? runCase.error.message
                : t("evalsTab.runError")}
          </div>
        )}
      </section>

      {editing && (
        <CaseEditorModal
          key={editing.kind === "edit" ? editing.c.id : "new"}
          agentId={agent.id}
          existing={editing.kind === "edit" ? editing.c : null}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
