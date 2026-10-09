/* CaseRow — one eval case: name, expected-vs-got, chip, status (icon + text,
   never colour alone) and per-row Run / Edit / Delete. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon } from "@devdigest/ui";
import type { EvalCaseSummary } from "@devdigest/shared";
import { caseChip } from "@/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/helpers";

type Status = EvalCaseSummary["last_run"]["status"];
const STATUS_ICON = { passed: "CheckCircle", failed: "XCircle", error: "AlertTriangle", never_run: "Clock" } as const;
const STATUS_COLOR: Record<Status, string> = {
  passed: "var(--ok)",
  failed: "var(--crit)",
  error: "var(--warn)",
  never_run: "var(--text-muted)",
};

export function CaseRow({
  c,
  busy,
  disabled,
  onRun,
  onEdit,
  onDelete,
}: {
  c: EvalCaseSummary;
  /** This case is currently running (single-case run). */
  busy: boolean;
  /** Row actions are blocked (suite running). */
  disabled: boolean;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("eval");
  const chip = caseChip(c);
  const st = c.last_run.status;
  const StatusIcon = Icon[STATUS_ICON[st]];
  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        border: "1px solid var(--border)",
        borderRadius: 8,
        background: "var(--bg-elevated)",
        listStyle: "none",
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 92, color: STATUS_COLOR[st], fontSize: 12.5, fontWeight: 600 }}>
        <StatusIcon size={14} aria-hidden="true" />
        {t(`evalsTab.status.${st}`)}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{c.name}</span>
          {chip && <Badge color="var(--text-secondary)" mono>{chip.kind === "empty" ? t("evalsTab.emptyChip") : chip.text}</Badge>}
          <Badge color="var(--text-muted)">{t(`caseEditor.expectation.${c.expectation}`)}</Badge>
          {c.invalid && <Badge color="var(--crit)">{t("evalsTab.invalidCase")}</Badge>}
          {c.edited_since_last_run && st !== "never_run" && <Badge color="var(--warn)">{t("evalsTab.editedSinceRun")}</Badge>}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 3 }}>
          {c.invalid
            ? (c.invalid_reason ?? t("evalsTab.invalidCase"))
            : st === "never_run"
              ? t("evalsTab.neverRun")
              : st === "error"
                ? (c.last_run.error ?? t("evalsTab.status.error"))
                : t("evalsTab.expectedVsGot", { expected: c.last_run.expected_count ?? 0, got: c.last_run.actual_count ?? 0 })}
        </div>
      </div>
      <Button kind="ghost" size="sm" icon="Play" loading={busy} disabled={disabled || c.invalid} onClick={onRun} aria-label={t("evalsTab.runNamed", { name: c.name })}>
        {t("evalsTab.run")}
      </Button>
      <Button kind="ghost" size="sm" icon="Edit" disabled={disabled} onClick={onEdit} aria-label={t("evalsTab.editNamed", { name: c.name })}>
        {t("evalsTab.edit")}
      </Button>
      <Button kind="danger" size="sm" icon="Trash" disabled={disabled} onClick={onDelete} aria-label={t("evalsTab.deleteNamed", { name: c.name })}>
        {t("evalsTab.delete")}
      </Button>
    </li>
  );
}
