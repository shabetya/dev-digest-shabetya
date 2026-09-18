/* ConventionCard — one extracted convention candidate: rule, evidence
   (file:line + snippet), confidence, and Accept/Reject actions. Mirrors
   FindingCard's layout (left border by tier, active-state action buttons). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, IconBtn, PercentProgress } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { confidenceColor } from "./constants";
import { s } from "./styles";

export function ConventionCard({
  candidate,
  pending,
  onAction,
}: {
  candidate: ConventionCandidate;
  pending?: boolean;
  onAction: (action: "accept" | "reject") => void;
}) {
  const t = useTranslations("conventions");
  const [copied, setCopied] = React.useState(false);
  const accepted = candidate.status === "accepted";
  const rejected = candidate.status === "rejected";
  const lineLabel =
    candidate.evidence_line_start === candidate.evidence_line_end
      ? String(candidate.evidence_line_start)
      : `${candidate.evidence_line_start}-${candidate.evidence_line_end}`;
  const pathLabel = `${candidate.evidence_path}:${lineLabel}`;

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(pathLabel);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };

  return (
    <div style={s.card(confidenceColor(candidate.confidence))}>
      <div style={s.header}>
        <div style={s.rule}>{candidate.rule}</div>
        <div style={s.actions}>
          <Button
            kind={accepted ? "primary" : "secondary"}
            size="sm"
            icon="Check"
            active={accepted}
            disabled={pending}
            onClick={() => onAction("accept")}
          >
            {accepted ? t("card.accepted") : t("card.accept")}
          </Button>
          <Button
            kind="ghost"
            size="sm"
            icon="X"
            active={rejected}
            disabled={pending}
            onClick={() => onAction("reject")}
          >
            {rejected ? t("card.rejected") : t("card.reject")}
          </Button>
        </div>
      </div>

      <div style={s.evidenceBox}>
        <div style={s.evidenceHeader}>
          <span className="mono" style={s.evidencePath}>
            {pathLabel}
          </span>
          <IconBtn
            icon={copied ? "Check" : "Copy"}
            label={t("card.copyPath")}
            size={24}
            onClick={copyPath}
          />
        </div>
        <pre className="mono" style={s.snippet}>
          {candidate.evidence_snippet}
        </pre>
      </div>

      <div style={s.confidenceWrap}>
        <PercentProgress
          value={candidate.confidence * 100}
          label={t("card.confidence")}
          color={confidenceColor(candidate.confidence)}
        />
      </div>
    </div>
  );
}
