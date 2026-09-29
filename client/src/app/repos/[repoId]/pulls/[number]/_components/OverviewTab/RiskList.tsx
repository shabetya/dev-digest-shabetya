"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { Risk } from "@devdigest/shared";
import { RISK_SEVERITY_META } from "./constants";
import { s, severityStyle } from "./styles";

/** Risk areas: severity icon + text label (never colour alone), title, optional
    explanation, and file refs that open the Files tab. All model text is
    rendered as plain text. */
export function RiskList({ risks, onOpenFile }: { risks: Risk[]; onOpenFile?: (file: string) => void }) {
  const t = useTranslations("brief");
  if (risks.length === 0) return <p style={s.briefMuted}>{t("noRisks")}</p>;
  return (
    <ul style={s.briefList}>
      {risks.map((risk, i) => {
        const meta = RISK_SEVERITY_META[risk.severity];
        const SevIcon = Icon[meta.icon];
        return (
          <li key={`${i}-${risk.title}`} style={s.riskItem}>
            <div style={s.riskTitleRow}>
              <span style={severityStyle(meta.color, meta.bg)}>
                <SevIcon size={12} aria-hidden />
                {t(`severity.${risk.severity}`)}
              </span>
              <span style={s.riskTitle}>{risk.title}</span>
            </div>
            {risk.explanation && <p style={s.riskExplanation}>{risk.explanation}</p>}
            {risk.file_refs.length > 0 && (
              <div style={s.riskRefs}>
                {risk.file_refs.map((file) => (
                  <button
                    key={file}
                    type="button"
                    style={s.fileLink}
                    title={t("openFile", { file })}
                    onClick={() => onOpenFile?.(file)}
                  >
                    {file}
                  </button>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
