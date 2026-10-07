/* RunsTable — an agent's recent suite runs. Doubles as the chart's table
   equivalent. Up to MAX_COMPARE rows are selectable (labelled checkboxes). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalSuiteRun } from "@devdigest/shared";
import { formatCost, formatPct, formatRanAt } from "@/components/eval/format";
import { MAX_COMPARE } from "@/app/eval/constants";
import { s } from "./styles";

export function RunsTable({
  runs,
  selected,
  onToggle,
}: {
  runs: EvalSuiteRun[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const t = useTranslations("eval");
  return (
    <table style={s.table}>
      <caption style={s.srOnly}>{t("dashboard.recentRuns")}</caption>
      <thead>
        <tr>
          <th scope="col" style={s.th}><span style={s.srOnly}>{t("agentPage.select")}</span></th>
          {(["version", "ranAt", "status", "recall", "precision", "citation", "pass", "cost"] as const).map((k) => (
            <th key={k} scope="col" style={s.th}>{t(`runsTable.${k}`)}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => {
          const checked = selected.includes(r.id);
          return (
            <tr key={r.id}>
              <td style={s.td}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!checked && selected.length >= MAX_COMPARE}
                  onChange={() => onToggle(r.id)}
                  aria-label={t("agentPage.selectRun", { version: r.agent_version, at: formatRanAt(r.ran_at) })}
                />
              </td>
              <td style={s.td}>v{r.agent_version}</td>
              <td style={s.td}>{formatRanAt(r.ran_at)}</td>
              <td style={s.td}>{t(`runsTable.statuses.${r.status}`)}</td>
              <td style={s.td}>{formatPct(r.recall)}</td>
              <td style={s.td}>{formatPct(r.precision)}</td>
              <td style={s.td}>{formatPct(r.citation_accuracy)}</td>
              <td style={s.td}>{r.cases_passed}/{r.cases_total}</td>
              <td style={s.td}>{formatCost(r.cost_usd)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
