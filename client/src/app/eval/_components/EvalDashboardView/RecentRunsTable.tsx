/* RecentRunsTable — workspace-wide recent suite runs (also the table equivalent of the sparklines). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalSuiteRun } from "@devdigest/shared";
import { formatCost, formatPct, formatRanAt } from "@/components/eval/format";
import { s } from "./styles";

export function RecentRunsTable({ runs, loading }: { runs: EvalSuiteRun[]; loading: boolean }) {
  const t = useTranslations("eval");
  if (!loading && runs.length === 0) return <p style={s.sub}>{t("workspace.noRuns")}</p>;
  return (
    <table style={s.table}>
      <caption style={s.srOnly}>{t("workspace.recentRuns")}</caption>
      <thead>
        <tr>
          {(["agent", "version", "ranAt", "status", "recall", "precision", "citation", "pass", "cost"] as const).map((k) => (
            <th key={k} scope="col" style={s.th}>{t(`runsTable.${k}`)}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => (
          <tr key={r.id}>
            <td style={s.td}>{r.agent_name}</td>
            <td style={s.td}>v{r.agent_version}</td>
            <td style={s.td}>{formatRanAt(r.ran_at)}</td>
            <td style={s.td}>{t(`runsTable.statuses.${r.status}`)}</td>
            <td style={s.td}>{formatPct(r.recall)}</td>
            <td style={s.td}>{formatPct(r.precision)}</td>
            <td style={s.td}>{formatPct(r.citation_accuracy)}</td>
            <td style={s.td}>{r.cases_passed}/{r.cases_total}</td>
            <td style={s.td}>{formatCost(r.cost_usd)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
