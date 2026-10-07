/* InputSection — the case's frozen input: Diff / Files / PR meta tabs.
   All text is edited as plain text (no HTML rendering). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Tabs } from "@devdigest/ui";
import type { EditorAction } from "./reducer";
import type { EditorForm, InputTab } from "./helpers";
import { parseJson } from "./helpers";
import { s } from "./styles";

const TAB_KEYS: InputTab[] = ["diff", "files", "meta"];

export function InputSection({ form, dispatch }: { form: EditorForm; dispatch: React.Dispatch<EditorAction> }) {
  const t = useTranslations("eval");
  const tabs = TAB_KEYS.map((k) => ({ key: k, label: t(`caseEditor.tabs.${k}`) }));
  const filesBad = form.filesText.trim() !== "" && !parseJson(form.filesText).ok;
  return (
    <div>
      <span style={s.label}>{t("caseEditor.inputLabel")}</span>
      <Tabs tabs={tabs} value={form.tab} onChange={(k) => dispatch({ type: "tab", value: k as InputTab })} pad="0" />
      <div style={{ paddingTop: 12 }}>
        {form.tab === "diff" && (
          <textarea
            aria-label={t("caseEditor.tabs.diff")}
            className="mono"
            rows={10}
            value={form.diff}
            placeholder={t("caseEditor.diffPlaceholder")}
            onChange={(e) => dispatch({ type: "field", field: "diff", value: e.target.value })}
            style={{ ...s.input, fontSize: 12.5, resize: "vertical" }}
          />
        )}
        {form.tab === "files" && (
          <>
            <textarea
              aria-label={t("caseEditor.tabs.files")}
              aria-invalid={filesBad}
              className="mono"
              rows={6}
              value={form.filesText}
              placeholder={t("caseEditor.filesPlaceholder")}
              onChange={(e) => dispatch({ type: "field", field: "filesText", value: e.target.value })}
              style={{ ...s.input, fontSize: 12.5, resize: "vertical" }}
            />
            {filesBad && <div role="alert" style={s.err}>{t("caseEditor.errors.filesJson")}</div>}
          </>
        )}
        {form.tab === "meta" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label htmlFor="eval-pr-title" style={s.label}>{t("caseEditor.titleLabel")}</label>
              <input
                id="eval-pr-title"
                value={form.prTitle}
                placeholder={t("caseEditor.titlePlaceholder")}
                onChange={(e) => dispatch({ type: "field", field: "prTitle", value: e.target.value })}
                style={s.input}
              />
            </div>
            <div>
              <label htmlFor="eval-pr-body" style={s.label}>{t("caseEditor.bodyLabel")}</label>
              <textarea
                id="eval-pr-body"
                rows={4}
                value={form.prBody}
                placeholder={t("caseEditor.bodyPlaceholder")}
                onChange={(e) => dispatch({ type: "field", field: "prBody", value: e.target.value })}
                style={{ ...s.input, resize: "vertical" }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
