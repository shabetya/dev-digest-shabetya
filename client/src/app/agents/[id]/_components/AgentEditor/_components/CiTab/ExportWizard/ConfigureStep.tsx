/* ConfigureStep — AC-5: trigger types + post_as. AC-6: static "Secrets
   expected" list (never reads/probes the real secret value). AC-20: the
   block-merge hint, exact wording, with no branch-protection automation. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Checkbox, FormField, SelectInput } from "@devdigest/ui";
import { ALL_TRIGGER_TYPES, toggleTrigger } from "./helpers";
import { s } from "./styles";

export function ConfigureStep({
  triggers,
  postAs,
  onTriggersChange,
  onPostAsChange,
  onBack,
  onContinue,
}: {
  triggers: string[];
  postAs: "github_review" | "pr_comment" | "none";
  onTriggersChange: (next: string[]) => void;
  onPostAsChange: (next: "github_review" | "pr_comment" | "none") => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const t = useTranslations("ci");
  const postAsOptions = [
    { value: "github_review", label: t("exportWizard.postAs.githubReview") },
    { value: "pr_comment", label: t("exportWizard.postAs.prComment") },
    { value: "none", label: t("exportWizard.postAs.none") },
  ];

  return (
    <div style={s.step}>
      <FormField label={t("exportWizard.triggerLabel")}>
        <div style={s.checkboxRow}>
          {ALL_TRIGGER_TYPES.map((type) => (
            <Checkbox
              key={type}
              checked={triggers.includes(type)}
              onChange={(checked) => onTriggersChange(toggleTrigger(triggers, type, checked))}
              label={t(`exportWizard.triggers.${type}`)}
            />
          ))}
        </div>
      </FormField>

      <FormField label={t("exportWizard.postResultsLabel")}>
        <SelectInput value={postAs} onChange={(v) => onPostAsChange(v as typeof postAs)} options={postAsOptions} />
      </FormField>

      <FormField label={t("exportWizard.secretsExpected")}>
        <ul style={s.secretsList}>
          <li>{t("exportWizard.secretNote", { key: "OPENROUTER_API_KEY" })}</li>
          <li>{t("exportWizard.githubTokenNote")}</li>
        </ul>
      </FormField>

      <div role="note" style={s.hint}>
        <strong>{t("exportWizard.blockMergeTitle")}:</strong> {t("exportWizard.blockMergeDesc")}
      </div>

      <div style={s.footer}>
        <Button kind="secondary" onClick={onBack}>
          {t("exportWizard.back")}
        </Button>
        <Button kind="primary" onClick={onContinue}>
          {t("exportWizard.continue")}
        </Button>
      </div>
    </div>
  );
}
