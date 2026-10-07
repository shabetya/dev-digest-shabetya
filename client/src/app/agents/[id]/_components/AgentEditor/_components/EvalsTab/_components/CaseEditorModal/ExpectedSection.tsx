/* ExpectedSection — expectation type, expected-output JSON editor with a live
   validity indicator (icon + text) and the "Finding skeleton" shortcut. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import type { EvalExpectationType } from "@devdigest/shared";
import type { EditorAction } from "./reducer";
import { parseJson, type EditorForm, type Validation } from "./helpers";
import { s } from "./styles";

const EXPECTATIONS: EvalExpectationType[] = ["must_find", "must_not_flag"];

export function ExpectedSection({
  form,
  dispatch,
  validation,
}: {
  form: EditorForm;
  dispatch: React.Dispatch<EditorAction>;
  validation: Validation;
}) {
  const t = useTranslations("eval");
  const jsonOk = parseJson(form.expectedText).ok;
  const shapeError = jsonOk && !validation.ok && validation.reason === "shape";
  const Ok = jsonOk ? Icon.CheckCircle : Icon.XCircle;
  return (
    <div>
      <div style={{ ...s.row, marginBottom: 8 }}>
        <label htmlFor="eval-expectation" style={{ ...s.label, marginBottom: 0 }}>{t("caseEditor.expectationLabel")}</label>
        <select
          id="eval-expectation"
          value={form.expectation}
          onChange={(e) => dispatch({ type: "expectation", value: e.target.value as EvalExpectationType })}
          style={{ ...s.input, width: "auto", padding: "6px 10px" }}
        >
          {EXPECTATIONS.map((x) => (
            <option key={x} value={x}>{t(`caseEditor.expectation.${x}`)}</option>
          ))}
        </select>
      </div>
      <div style={{ ...s.row, marginBottom: 6 }}>
        <label htmlFor="eval-expected" style={{ ...s.label, marginBottom: 0 }}>{t("caseEditor.expectedOutput")}</label>
        <span style={s.valid(jsonOk)} role="status">
          <Ok size={13} aria-hidden="true" />
          {jsonOk ? t("caseEditor.validJson") : t("caseEditor.invalidJson")}
        </span>
        <span style={{ flex: 1 }} />
        <Button kind="ghost" size="sm" icon="Code" onClick={() => dispatch({ type: "skeleton" })}>
          {t("caseEditor.skeleton")}
        </Button>
      </div>
      <textarea
        id="eval-expected"
        className="mono"
        rows={9}
        aria-invalid={!jsonOk || shapeError}
        value={form.expectedText}
        onChange={(e) => dispatch({ type: "field", field: "expectedText", value: e.target.value })}
        style={{ ...s.input, fontSize: 12.5, resize: "vertical" }}
      />
      {shapeError && (
        <div role="alert" style={s.err}>
          {t("caseEditor.errors.shape", { message: validation.message ?? "" })}
        </div>
      )}
      <div style={s.note}>{t(`caseEditor.hint.${form.expectation}`)}</div>
    </div>
  );
}
