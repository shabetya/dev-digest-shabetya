/* PreviewStep — AC-2: the generated file set. The manifest/skill/memory
   files are read-only; the workflow YAML is shown editable (a local-only
   edit — see ExportWizard's header comment for why nothing is sent back). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Skeleton } from "@devdigest/ui";
import type { CiFile } from "@devdigest/shared";
import { s } from "./styles";
import { workflowFile } from "./helpers";

export function PreviewStep({
  files,
  loading,
  workflowEdit,
  onWorkflowEditChange,
  onBack,
  onContinue,
}: {
  files: CiFile[] | undefined;
  loading: boolean;
  workflowEdit: string;
  onWorkflowEditChange: (v: string) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const t = useTranslations("ci");
  const workflow = workflowFile(files);
  const isOverridden = Boolean(workflow) && workflowEdit !== workflow?.contents;

  return (
    <div style={s.step}>
      <div style={s.sub}>{t("exportWizard.filesToCreate")}</div>
      {loading ? (
        <Skeleton height={200} />
      ) : (
        <div style={s.fileList}>
          {(files ?? [])
            .filter((f) => f.path !== workflow?.path)
            .map((f) => (
              <details key={f.path} style={s.fileItem}>
                <summary style={s.fileSummary}>{f.path}</summary>
                <pre style={s.filePre}>{f.contents}</pre>
              </details>
            ))}
          {workflow && (
            <div style={s.fileItem}>
              <div style={s.fileSummary}>
                {workflow.path} <span style={s.editableTag}>{t("exportWizard.editable")}</span>
              </div>
              <textarea
                aria-label={workflow.path}
                value={workflowEdit}
                onChange={(e) => onWorkflowEditChange(e.target.value)}
                style={s.workflowTextarea}
                rows={14}
              />
              {isOverridden && (
                <div role="alert" style={s.hint}>
                  {t("exportWizard.overrideWarning")}
                </div>
              )}
            </div>
          )}
        </div>
      )}

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
