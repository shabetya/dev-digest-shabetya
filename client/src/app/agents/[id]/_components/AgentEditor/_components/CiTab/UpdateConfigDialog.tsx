/* UpdateConfigDialog — CiTab's "Update CI config" entry point (Fix C /
   PLAN-05's approved default). The full 4-step `ExportWizard` (Target →
   Preview → Configure → Install) is right for a NEW install, where none of
   repo/target/triggers/post_as is known yet. For an ALREADY-installed repo
   (this dialog's only use case — opened from a `ci_installations` row),
   repo + target are already known, so this is a lighter, single-dialog
   re-export: regenerate the files from the agent's CURRENT config and
   re-open the PR in one click. Reuses the `publishDialog.*` i18n namespace
   (an earlier/alternate design for the same action) rather than building a
   second wizard. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import type { Agent, CiInstallation } from "@devdigest/shared";
import { useExportCi } from "@/lib/hooks/ci";
import { DEFAULT_TRIGGERS } from "./ExportWizard/helpers";

export function UpdateConfigDialog({
  agent,
  installation,
  onClose,
}: {
  agent: Agent;
  installation: CiInstallation;
  onClose: () => void;
}) {
  const t = useTranslations("ci");
  const exportCi = useExportCi(agent.id);
  const prUrl = exportCi.data?.pr_url ?? null;

  const handlePublish = () =>
    exportCi.mutate({
      repo: installation.repo,
      target: installation.target_type,
      action: "open_pr",
      post_as: "github_review",
      triggers: DEFAULT_TRIGGERS,
      base: "main",
    });

  return (
    <Modal
      width={480}
      title={t("publishDialog.title")}
      subtitle={t("publishDialog.subtitle", { agentName: agent.name, repo: installation.repo })}
      onClose={onClose}
    >
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
        {prUrl ? (
          <>
            <div style={{ fontWeight: 600 }}>{t("publishDialog.doneTitle")}</div>
            <div>{t("publishDialog.doneBody", { repo: installation.repo })}</div>
            <div>
              <a
                href={prUrl}
                target="_blank"
                rel="noreferrer"
                style={{ color: "var(--accent)", textDecoration: "underline" }}
              >
                {t("publishDialog.openPr")}
              </a>
            </div>
          </>
        ) : (
          <>
            <div>{t("publishDialog.intro", { repo: installation.repo })}</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              {t("publishDialog.secretNote", { key: "OPENROUTER_API_KEY" })}
            </div>
          </>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
          <Button kind="secondary" onClick={onClose}>
            {prUrl ? t("publishDialog.close") : t("publishDialog.cancel")}
          </Button>
          {!prUrl && (
            <Button kind="primary" loading={exportCi.isPending} onClick={handlePublish}>
              {exportCi.isPending ? t("publishDialog.publishing") : t("publishDialog.republish")}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
