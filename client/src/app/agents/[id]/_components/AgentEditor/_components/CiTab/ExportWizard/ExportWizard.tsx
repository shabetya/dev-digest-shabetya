/* ExportWizard — the 4-step Target → Preview → Configure → Install flow
   (SPEC-05 AC-1..AC-8, AC-20). Wires the presentational `ExportWizardSteps`
   stepper to the 4 step bodies and the `useExportCi` hook.

   Every (repo/base/trigger/post_as) change re-calls `export-ci` with
   `action: "files"` to refresh Preview; that call is a harmless idempotent
   upsert of the installation row (same one AC-7's re-export relies on), not
   a separate "preview-only" endpoint — there isn't one in this spec.

   Fix A (AC-2): the Preview step's workflow-YAML textarea edit is sent back
   as `workflow_yaml_override` on the final Install call (open_pr), and
   swapped into the zip's file set before download — so what the user edited
   at Preview is what they actually get, on both the PR and zip paths. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Modal, ExportWizardSteps } from "@devdigest/ui";
import type { Agent, CiExportInput } from "@devdigest/shared";
import { useExportCi } from "@/lib/hooks/ci";
import { TargetStep } from "./TargetStep";
import { PreviewStep } from "./PreviewStep";
import { ConfigureStep } from "./ConfigureStep";
import { InstallStep } from "./InstallStep";
import { DEFAULT_TRIGGERS, withWorkflowEdit, workflowFile } from "./helpers";
import { buildZip } from "./zip";

type PostAs = "github_review" | "pr_comment" | "none";

export function ExportWizard({
  agent,
  initialRepo,
  onClose,
}: {
  agent: Agent;
  initialRepo?: string;
  onClose: () => void;
}) {
  const t = useTranslations("ci");
  const exportCi = useExportCi(agent.id);

  const [step, setStep] = React.useState(0);
  const [repo, setRepo] = React.useState(initialRepo ?? "");
  const [base, setBase] = React.useState("main");
  const [triggers, setTriggers] = React.useState<string[]>(DEFAULT_TRIGGERS);
  const [postAs, setPostAs] = React.useState<PostAs>("github_review");
  const [workflowEdit, setWorkflowEdit] = React.useState("");

  const generate = (input: Partial<CiExportInput> = {}) =>
    exportCi.mutate(
      { repo, base, target: "gha", action: "files", post_as: postAs, triggers, ...input },
      {
        onSuccess: (result) => {
          const wf = workflowFile(result.files);
          if (wf) setWorkflowEdit(wf.contents);
        },
      },
    );

  const goToPreview = () => {
    setStep(1);
    generate();
  };

  const files = exportCi.data?.files;

  return (
    <Modal
      width={720}
      title={t("exportWizard.title")}
      subtitle={t("exportWizard.subtitle", { agentName: agent.name })}
      onClose={onClose}
    >
      <div style={{ padding: "16px 24px 0" }}>
        <ExportWizardSteps
          step={step}
          labels={[
            t("exportWizard.steps.target"),
            t("exportWizard.steps.preview"),
            t("exportWizard.steps.configure"),
            t("exportWizard.steps.install"),
          ]}
        />
      </div>

      {step === 0 && (
        <TargetStep repo={repo} base={base} onRepoChange={setRepo} onBaseChange={setBase} onContinue={goToPreview} />
      )}

      {step === 1 && (
        <PreviewStep
          files={files}
          loading={exportCi.isPending}
          workflowEdit={workflowEdit}
          onWorkflowEditChange={setWorkflowEdit}
          onBack={() => setStep(0)}
          onContinue={() => setStep(2)}
        />
      )}

      {step === 2 && (
        <ConfigureStep
          triggers={triggers}
          postAs={postAs}
          onTriggersChange={(next) => {
            setTriggers(next);
            generate({ triggers: next });
          }}
          onPostAsChange={(next) => {
            setPostAs(next);
            generate({ post_as: next });
          }}
          onBack={() => setStep(1)}
          onContinue={() => setStep(3)}
        />
      )}

      {step === 3 && (
        <InstallStep
          repo={repo}
          fileCount={files?.length ?? 0}
          prUrl={exportCi.data?.pr_url ?? null}
          installing={exportCi.isPending}
          onInstallPr={() => generate({ action: "open_pr", workflow_yaml_override: workflowEdit })}
          onDownloadZip={() => downloadZip(repo, withWorkflowEdit(files, workflowEdit))}
          onBack={() => setStep(2)}
          onClose={onClose}
        />
      )}
    </Modal>
  );
}

function downloadZip(repo: string, files: { path: string; contents: string }[]): void {
  const bytes = buildZip(files);
  const blob = new Blob([bytes as BlobPart], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `devdigest-ci-${repo.replace("/", "-") || "export"}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
