"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, TextInput, SelectInput, Textarea, Toggle, Button } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { approxTokens } from "./helpers";
import { configReducer, initialConfigState, type ConfigAction, type ConfigState } from "./reducer";
import { s } from "./styles";

const TYPE_OPTIONS: SkillType[] = ["rubric", "convention", "security", "custom"];

/** Config tab — name/description/type/body + enabled toggle. Keyed on
    skill.id by the caller so switching skills remounts + resets the form. */
export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const update = useUpdateSkill();
  const [state, dispatch] = React.useReducer(configReducer, skill, initialConfigState);
  const setField = <K extends keyof ConfigState>(field: K, value: ConfigState[K]) =>
    dispatch({ field, value } as ConfigAction);

  const typeOptions = TYPE_OPTIONS.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));
  const dirty =
    state.name !== skill.name ||
    state.description !== skill.description ||
    state.type !== skill.type ||
    state.body !== skill.body;

  const save = () =>
    update.mutate(
      { id: skill.id, patch: { name: state.name, description: state.description, type: state.type, body: state.body, enabled: state.enabled } },
      { onSuccess: (data) => toast.success(t("editor.config.saved", { version: data.version })) },
    );

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("editor.config.title")}</h2>
        <label style={s.enabledLabel}>
          {t("editor.config.enabled")}
          <Toggle on={state.enabled} onChange={(v) => setField("enabled", v)} size={16} />
        </label>
      </div>
      <FormField label={t("editor.config.name")} required>
        <TextInput value={state.name} onChange={(v) => setField("name", v)} />
      </FormField>
      <FormField label={t("editor.config.description")} required hint={t("editor.config.descriptionHint")}>
        <TextInput value={state.description} onChange={(v) => setField("description", v)} />
      </FormField>
      <FormField label={t("editor.config.type")}>
        <SelectInput value={state.type} onChange={(v) => setField("type", v as SkillType)} options={typeOptions} />
      </FormField>
      <FormField
        label={t("editor.config.body")}
        hint={t("editor.config.bodyHint")}
        right={
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {dirty && <span style={s.unsavedBadge}>{t("editor.config.unsaved")}</span>}
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {t("editor.config.tokens", { count: approxTokens(state.body) })}
            </span>
          </span>
        }
      >
        <Textarea value={state.body} onChange={(v) => setField("body", v)} rows={14} mono />
      </FormField>
      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={update.isPending}>
          {update.isPending ? t("editor.config.saving") : t("editor.config.save")}
        </Button>
        {update.isSuccess && (
          <span style={s.savedNote}>{t("editor.config.saved", { version: update.data?.version })}</span>
        )}
      </div>
    </div>
  );
}
