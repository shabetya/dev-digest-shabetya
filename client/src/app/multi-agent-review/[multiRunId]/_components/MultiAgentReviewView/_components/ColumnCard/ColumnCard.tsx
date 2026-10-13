/* ColumnCard — one agent's column in the Columns view (AC-13). Live status
   ring (score once known, colour-derived at render via CircularScore — never
   stored) while in flight; a "run deleted" placeholder when the underlying
   agent_run was individually removed (AC-12 edge case). */
"use client";

import { useTranslations } from "next-intl";
import { CircularScore, Icon, IconBtn } from "@devdigest/ui";
import type { AgentColumn } from "@devdigest/shared";
import { s } from "./styles";

export function ColumnCard({
  column,
  onViewTrace,
}: {
  column: AgentColumn;
  onViewTrace: (runId: string) => void;
}) {
  const t = useTranslations("multiAgentReview.results");

  return (
    <div style={s.card}>
      <div style={s.headerRow}>
        <span style={s.name}>{column.agent_name}</span>
        {column.status === "done" && column.score != null && <CircularScore score={column.score} size={36} stroke={3} />}
        {column.run_id && (
          <IconBtn
            icon="Eye"
            size={28}
            label={t("viewTrace", { agent: column.agent_name })}
            onClick={() => onViewTrace(column.run_id!)}
          />
        )}
      </div>

      {column.status === "running" && (
        <div style={s.statusRunning}>
          <Icon.RefreshCw size={13} style={s.spin} />
          {t("running")}
        </div>
      )}
      {(column.status === "failed" || column.status === "cancelled") && (
        <div style={s.statusFailed}>
          <Icon.AlertOctagon size={13} />
          {column.status}
        </div>
      )}
      {column.status === "deleted" && (
        <div style={s.statusDeleted}>
          <Icon.Slash size={13} />
          {t("runDeleted")}
        </div>
      )}
      {column.status === "done" && (
        <div style={s.meta}>
          {column.findings.length} finding{column.findings.length === 1 ? "" : "s"}
        </div>
      )}
    </div>
  );
}
