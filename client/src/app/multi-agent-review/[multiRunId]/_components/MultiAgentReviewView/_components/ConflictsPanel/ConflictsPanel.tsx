/* ConflictsPanel — "Where agents disagree" (AC-16/17/18). Sourced from the
   SAME useMultiAgentRun() response's `conflicts` field — no second
   hook/request. Rendered only when columns.length >= 2 (the caller enforces
   that); `conflicts` is server-computed. The "Show only conflicts" toggle
   filters client-side over the already-fetched list.

   `status === 'pending'` and `status === 'computed'` can both arrive with an
   empty `conflicts` array — they are NOT the same thing: "pending" means the
   matching pass hasn't run yet (most columns still mid-flight), "computed"
   means it ran and found nothing to disagree about. Rendering the same
   empty-state copy for both would silently tell the user "agents agree"
   before the system has actually reached that conclusion, so the two get
   distinct treatments below. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SeverityBadge, Toggle, type Severity } from "@devdigest/ui";
import type { Conflict, MultiAgentRun } from "@devdigest/shared";
import { visibleConflicts } from "../../helpers";
import { s } from "./styles";

export function ConflictsPanel({
  conflicts,
  status,
}: {
  conflicts: Conflict[];
  status: MultiAgentRun["conflicts_status"];
}) {
  const t = useTranslations("multiAgentReview.results");
  const [showOnlyConflicts, setShowOnlyConflicts] = React.useState(false);
  const visible = visibleConflicts(conflicts, showOnlyConflicts);
  const pending = status === "pending";

  return (
    <div style={s.panel}>
      <div style={s.headerRow}>
        <span style={s.title}>{t("conflictsTitle")}</span>
        <label style={s.toggleRow}>
          {t("showOnlyConflicts")}
          <Toggle on={showOnlyConflicts} onChange={setShowOnlyConflicts} size={14} disabled={pending} />
        </label>
      </div>

      {pending ? (
        <div style={s.pending}>
          <Icon.RefreshCw size={13} style={s.pendingSpin} />
          {t("conflictsPending")}
        </div>
      ) : visible.length === 0 ? (
        <div style={s.empty}>{showOnlyConflicts ? t("noConflictsFiltered") : t("noConflicts")}</div>
      ) : (
        visible.map((c) => (
          <div key={`${c.file}:${c.line}`} style={s.block}>
            <span style={s.location}>
              {c.file}:{c.line}
            </span>
            <span style={s.blockTitle}>{c.title}</span>
            <div style={s.takesRow}>
              {c.takes.map((take) => (
                <span key={take.agent_id} style={s.take(take.verdict === "ignored")}>
                  <strong>{take.persona}</strong>{" "}
                  {take.verdict === "ignored" ? (
                    t("ignoredVerdict")
                  ) : (
                    <SeverityBadge severity={take.verdict as Severity} compact />
                  )}
                </span>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
