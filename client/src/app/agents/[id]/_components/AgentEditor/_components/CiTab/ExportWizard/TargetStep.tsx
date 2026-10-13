/* TargetStep — AC-1: 4 target cards (GitHub Actions selectable, the other
   three disabled "Coming soon"), then the target repo + base branch. Both
   fields are selects backed by live data — repo from the workspace's
   imported repos (useRepos), base branch from that repo's GitHub branches
   (useRepoBranches) — falling back to free text when that data isn't
   available (no repos imported yet, or the branch list can't be fetched). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, SearchableSelect, TextInput } from "@devdigest/ui";
import type { CiTarget } from "@devdigest/shared";
import { useRepoBranches, useRepos } from "@/lib/hooks";
import { s } from "./styles";

const TARGETS: { value: CiTarget; enabled: boolean }[] = [
  { value: "gha", enabled: true },
  { value: "circle", enabled: false },
  { value: "jenkins", enabled: false },
  { value: "cli", enabled: false },
];

export function TargetStep({
  repo,
  base,
  onRepoChange,
  onBaseChange,
  onContinue,
}: {
  repo: string;
  base: string;
  onRepoChange: (v: string) => void;
  onBaseChange: (v: string) => void;
  onContinue: () => void;
}) {
  const t = useTranslations("ci");
  const canContinue = repo.trim().length > 0;
  const { data: repos, isLoading: reposLoading } = useRepos();
  const repoOptions = (repos ?? []).map((r) => ({ value: r.full_name, label: r.full_name }));

  const selectedRepo = repos?.find((r) => r.full_name === repo);
  const { data: branches, isLoading: branchesLoading } = useRepoBranches(selectedRepo?.id);
  const branchOptions = (branches ?? []).map((b) => ({ value: b, label: b }));

  const handleRepoChange = (v: string) => {
    onRepoChange(v);
    const match = repos?.find((r) => r.full_name === v);
    if (match) onBaseChange(match.default_branch);
  };

  return (
    <div style={s.step}>
      <div style={s.targetGrid}>
        {TARGETS.map((target) => (
          <div
            key={target.value}
            role="group"
            aria-label={t(`exportWizard.targets.${target.value}`)}
            style={s.targetCard(target.enabled, target.value === "gha")}
          >
            <div style={s.targetName}>
              {t(`exportWizard.targets.${target.value}`)}
              {target.value === "gha" && <span style={s.badgeRecommended}>{t("exportWizard.recommended")}</span>}
            </div>
            <div style={s.sub}>{t(`exportWizard.targets.${target.value}Desc`)}</div>
            {!target.enabled && <div style={s.comingSoon}>{t("exportWizard.comingSoon")}</div>}
          </div>
        ))}
      </div>

      <FormField
        label={t("exportWizard.repoLabel")}
        hint={repoOptions.length === 0 && !reposLoading ? t("exportWizard.repoEmptyHint") : t("exportWizard.repoHint")}
      >
        {repoOptions.length === 0 ? (
          <TextInput
            value={repo}
            onChange={onRepoChange}
            placeholder={reposLoading ? t("exportWizard.repoLoading") : t("exportWizard.repoPlaceholderManual")}
            aria-label={t("exportWizard.repoLabel")}
          />
        ) : (
          <SearchableSelect
            value={repo}
            onChange={handleRepoChange}
            options={repoOptions}
            placeholder={t("exportWizard.repoPlaceholder")}
          />
        )}
      </FormField>

      <FormField label={t("exportWizard.baseLabel")}>
        {branchOptions.length === 0 ? (
          <TextInput
            value={base}
            onChange={onBaseChange}
            placeholder={branchesLoading ? t("exportWizard.branchLoading") : undefined}
            aria-label={t("exportWizard.baseLabel")}
          />
        ) : (
          <SearchableSelect
            value={base}
            onChange={onBaseChange}
            options={branchOptions}
            placeholder={t("exportWizard.branchPlaceholder")}
          />
        )}
      </FormField>

      <div style={s.footer}>
        <Button kind="primary" disabled={!canContinue} onClick={onContinue}>
          {t("exportWizard.continue")}
        </Button>
      </div>
    </div>
  );
}
