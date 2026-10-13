/* InstallStep — AC-7 (open a PR, idempotent) and AC-8 (download a zip, no
   GitHub write). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { s } from "./styles";

export function InstallStep({
  repo,
  fileCount,
  prUrl,
  installing,
  onInstallPr,
  onDownloadZip,
  onBack,
  onClose,
}: {
  repo: string;
  fileCount: number;
  prUrl: string | null;
  installing: boolean;
  onInstallPr: () => void;
  onDownloadZip: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("ci");

  return (
    <div style={s.step}>
      <div style={s.installCard}>
        <div style={s.fileSummary}>{t("exportWizard.installCardTitle")}</div>
        <div style={s.sub}>{t("exportWizard.installCardBody", { repo, count: fileCount })}</div>
        <Button kind="primary" loading={installing} onClick={onInstallPr}>
          {installing ? t("exportWizard.installing") : t("exportWizard.install")}
        </Button>
        {prUrl && (
          <div>
            <a
              href={prUrl}
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--accent)", textDecoration: "underline" }}
            >
              {t("exportWizard.viewPr")}
            </a>
          </div>
        )}
      </div>

      <div style={s.installCard}>
        <div style={s.fileSummary}>{t("exportWizard.zipCardTitle")}</div>
        <div style={s.sub}>{t("exportWizard.zipCardBody", { count: fileCount })}</div>
        <Button kind="secondary" onClick={onDownloadZip}>
          {t("exportWizard.downloadZip")}
        </Button>
      </div>

      <div style={s.footer}>
        <Button kind="secondary" onClick={onBack}>
          {t("exportWizard.back")}
        </Button>
        <Button kind="tertiary" onClick={onClose}>
          {t("publishDialog.close")}
        </Button>
      </div>
    </div>
  );
}
