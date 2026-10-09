/* CaseEditorModal — create/edit one eval case (SPEC-04 AC-10). Save / Run case /
   "Run on save" (localStorage only). Invalid JSON or shape disables Save and Run. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Modal, Toggle } from "@devdigest/ui";
import type { EvalCaseSummary, EvalRunResult } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useCreateEvalCase, useRunEvalCase, useUpdateEvalCase } from "@/lib/hooks/eval";
import { useModalA11y } from "@/components/eval/useModalA11y";
import { formatPct } from "@/components/eval/format";
import { editorReducer } from "./reducer";
import { blankForm, formFromCase, readRunOnSave, validateForm, writeRunOnSave } from "./helpers";
import { InputSection } from "./InputSection";
import { ExpectedSection } from "./ExpectedSection";
import { s } from "./styles";

export function CaseEditorModal({
  agentId,
  existing,
  onClose,
}: {
  agentId: string;
  /** The case being edited; omitted for "New eval case". */
  existing?: EvalCaseSummary | null;
  onClose: () => void;
}) {
  const t = useTranslations("eval");
  const [form, dispatch] = React.useReducer(editorReducer, existing, (c) => (c ? formFromCase(c) : blankForm()));
  const [savedId, setSavedId] = React.useState<string | null>(existing?.id ?? null);
  const [runOnSave, setRunOnSave] = React.useState(readRunOnSave);
  const [result, setResult] = React.useState<EvalRunResult | null>(null);
  const [errorText, setErrorText] = React.useState<string | null>(null);
  const create = useCreateEvalCase(agentId);
  const update = useUpdateEvalCase(agentId);
  const run = useRunEvalCase(agentId);
  const ref = useModalA11y(onClose);

  const validation = validateForm(form, existing);
  const busy = create.isPending || update.isPending || run.isPending;

  const toggleRunOnSave = (on: boolean) => {
    setRunOnSave(on);
    writeRunOnSave(on);
  };

  /** Persist the form (create the first time, patch afterwards); returns the case id. */
  const persist = async (): Promise<string | null> => {
    if (!validation.ok) return null;
    const saved = savedId
      ? await update.mutateAsync({ id: savedId, patch: validation.body })
      : await create.mutateAsync(validation.body);
    setSavedId(saved.id);
    return saved.id;
  };

  const act = async (thenRun: boolean) => {
    setErrorText(null);
    try {
      const id = await persist();
      if (!id) return;
      if (thenRun) {
        setResult(await run.mutateAsync(id));
      } else {
        onClose();
      }
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      setErrorText(code === "llm_unavailable" ? t("caseEditor.errors.llm_unavailable") : e instanceof ApiError ? e.message : t("caseEditor.errors.generic"));
    }
  };

  const caseRun = result?.case_run;
  return (
    <div ref={ref}>
      <Modal
        width={760}
        title={existing ? t("caseEditor.caseTitle", { name: existing.name }) : t("caseEditor.newCase")}
        onClose={onClose}
        footer={
          <div style={s.footer}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <Toggle on={runOnSave} onChange={toggleRunOnSave} />
              {t("caseEditor.runOnSave")}
            </label>
            <span style={{ flex: 1 }} />
            <Button kind="secondary" icon="Play" loading={run.isPending} disabled={!validation.ok || busy} onClick={() => act(true)}>
              {run.isPending ? t("caseEditor.running") : t("caseEditor.runCase")}
            </Button>
            <Button kind="primary" disabled={!validation.ok || busy} onClick={() => act(runOnSave)}>
              {create.isPending || update.isPending ? t("caseEditor.saving") : t("caseEditor.save")}
            </Button>
          </div>
        }
      >
        <div style={s.body} aria-busy={busy}>
          <div>
            <label htmlFor="eval-case-name" style={s.label}>{t("caseEditor.nameLabel")}</label>
            <input
              id="eval-case-name"
              value={form.name}
              placeholder={t("caseEditor.namePlaceholder")}
              onChange={(e) => dispatch({ type: "field", field: "name", value: e.target.value })}
              style={s.input}
            />
          </div>
          <InputSection form={form} dispatch={dispatch} />
          <ExpectedSection form={form} dispatch={dispatch} validation={validation} />
          <div aria-live="polite">
            {errorText && <div role="alert" style={s.err}>{errorText}</div>}
            {caseRun && (
              <div style={s.result(caseRun.status === "passed")}>
                <strong style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {caseRun.status === "passed" ? <Icon.CheckCircle size={14} aria-hidden="true" /> : <Icon.XCircle size={14} aria-hidden="true" />}
                  {caseRun.status === "passed" ? t("caseEditor.lastRunPassed") : caseRun.status === "error" ? t("caseEditor.lastRunError") : t("caseEditor.lastRunFailed")}
                </strong>
                <div style={{ marginTop: 4, color: "var(--text-secondary)" }}>
                  {caseRun.status === "error"
                    ? caseRun.error
                    : t("caseEditor.resultSummary", {
                        recall: formatPct(caseRun.recall),
                        precision: formatPct(caseRun.precision),
                        citation: formatPct(caseRun.citation_accuracy),
                        duration: ((caseRun.duration_ms ?? 0) / 1000).toFixed(1),
                      })}
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
