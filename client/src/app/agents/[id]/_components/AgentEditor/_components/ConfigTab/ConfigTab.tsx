"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, TextInput, SelectInput, SearchableSelect, Textarea, Toggle, Button } from "@devdigest/ui";
import type { Agent, CiFailOn, Provider, ReviewStrategy } from "@devdigest/shared";
import { useUpdateAgent, useProviderModels } from "@/lib/hooks/agents";
import { useToast } from "@/lib/toast";
import { toModelOptions } from "@/lib/model-label";
import { CI_FAIL_ON_VALUES, OUTPUT_SCHEMA_VALUE, PROVIDER_OPTIONS, STRATEGY_VALUES } from "./constants";
import { configReducer, initialConfigState, type ConfigAction, type ConfigState } from "./reducer";
import { s } from "./styles";

/** Config tab — name/description/provider/model/system-prompt + enabled toggle.
    The caller keys this component on `agent.id` so switching agents remounts
    it and resets the form naturally, instead of syncing state via an effect. */
export function ConfigTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const toast = useToast();
  const update = useUpdateAgent();
  const [state, dispatch] = React.useReducer(configReducer, agent, initialConfigState);
  const setField = <K extends keyof ConfigState>(field: K, value: ConfigState[K]) =>
    dispatch({ field, value } as ConfigAction);

  const { data: models } = useProviderModels(state.provider);
  // Show the price (USD per 1M in/out tokens) in the label when the provider
  // exposes it (OpenRouter) so a cheap model is easy to pick; value stays the id.
  const modelOptions = toModelOptions(models);
  const hasModel = modelOptions.some((o) => (typeof o === "string" ? o : o.value) === state.model);
  if (!hasModel) modelOptions.unshift(state.model);
  // Empty list after load = provider key missing/invalid (listModels failed) —
  // guide the user instead of showing a silent one-item dropdown.
  const noModels = models !== undefined && models.length === 0;

  // Friendly labels for the strategy select (values come from constants).
  const strategyOptions = STRATEGY_VALUES.map((v) => ({ value: v, label: t(`config.strategyOptions.${v}`) }));
  const ciFailOnOptions = CI_FAIL_ON_VALUES.map((v) => ({ value: v, label: t(`config.ciFailOnOptions.${v}`) }));

  const save = () =>
    update.mutate(
      {
        id: agent.id,
        patch: {
          name: state.name,
          description: state.description,
          provider: state.provider,
          model: state.model,
          system_prompt: state.systemPrompt,
          strategy: state.strategy,
          ci_fail_on: state.ciFailOn,
          repo_intel: state.repoIntel,
          enabled: state.enabled,
        },
      },
      {
        // Failures are surfaced by the global mutation error toast; confirm the
        // save with a success toast (not just the inline "Saved (vN)" note).
        onSuccess: (data) => toast.success(t("config.savedToast", { version: data.version })),
      },
    );

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("config.title")}</h2>
        <label style={s.enabledLabel}>
          {t("config.enabled")}
          <Toggle on={state.enabled} onChange={(v) => setField("enabled", v)} size={16} />
        </label>
      </div>
      <FormField label={t("config.name")} required>
        <TextInput value={state.name} onChange={(v) => setField("name", v)} />
      </FormField>
      <FormField label={t("config.description")}>
        <TextInput value={state.description} onChange={(v) => setField("description", v)} />
      </FormField>
      <FormField label={t("config.provider")}>
        <SelectInput
          value={state.provider}
          onChange={(v) => setField("provider", v as Provider)}
          options={[...PROVIDER_OPTIONS]}
        />
      </FormField>
      <FormField
        label={t("config.model")}
        hint={noModels ? t("config.modelEmptyHint", { provider: state.provider }) : t("config.modelHint")}
      >
        <SearchableSelect
          value={state.model}
          onChange={(v) => setField("model", v)}
          options={modelOptions}
          placeholder={t("config.modelSearch")}
        />
      </FormField>
      <FormField label={t("config.strategy")} hint={t("config.strategyHint")}>
        <SelectInput
          value={state.strategy}
          onChange={(v) => setField("strategy", v as ReviewStrategy)}
          options={strategyOptions}
        />
      </FormField>
      <FormField label={t("config.ciFailOn")} hint={t("config.ciFailOnHint")}>
        <SelectInput
          value={state.ciFailOn}
          onChange={(v) => setField("ciFailOn", v as CiFailOn)}
          options={ciFailOnOptions}
        />
      </FormField>
      <FormField label={t("config.repoIntel")} hint={t("config.repoIntelHint")}>
        <label style={s.enabledLabel}>
          <Toggle on={state.repoIntel} onChange={(v) => setField("repoIntel", v)} size={16} />
        </label>
      </FormField>
      <FormField label={t("config.systemPrompt")} hint={t("config.systemPromptHint")}>
        <Textarea value={state.systemPrompt} onChange={(v) => setField("systemPrompt", v)} rows={8} mono />
      </FormField>
      <FormField label={t("config.outputSchema")}>
        <SelectInput value={OUTPUT_SCHEMA_VALUE} options={[OUTPUT_SCHEMA_VALUE]} />
      </FormField>
      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={update.isPending}>
          {update.isPending ? t("config.saving") : t("config.save")}
        </Button>
        {update.isSuccess && (
          <span style={s.savedNote}>{t("config.saved", { version: update.data?.version })}</span>
        )}
      </div>
    </div>
  );
}
