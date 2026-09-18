"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Modal, FormField, TextInput, SelectInput, Textarea, Toggle, Icon } from "@devdigest/ui";
import type { ConventionCandidate, SkillType } from "@devdigest/shared";
import { useCreateSkill } from "@/lib/hooks/skills";
import { buildSkillBodyFromConventions, defaultSkillName, repoLabelFor } from "./helpers";
import { s } from "./styles";

const MODAL_WIDTH = 640;
const TYPE_OPTIONS: SkillType[] = ["convention", "rubric", "security", "custom"];

/**
 * Merge accepted convention candidates into one editable draft Skill.
 * Defaults to `enabled: true` — unlike an imported file, every candidate here
 * was already individually Accepted by a human before this modal opened.
 */
export function CreateSkillModal({
  accepted,
  repoFullName,
  onClose,
}: {
  accepted: ConventionCandidate[];
  repoFullName: string;
  onClose: () => void;
}) {
  const t = useTranslations("conventions");
  const tSkills = useTranslations("skills");
  const router = useRouter();
  const create = useCreateSkill();
  const repoLabel = repoLabelFor(repoFullName);

  const [name, setName] = React.useState(defaultSkillName(repoLabel));
  const [description, setDescription] = React.useState(
    t("modal.descriptionDefault", { count: accepted.length, repo: repoLabel }),
  );
  const [type, setType] = React.useState<SkillType>("convention");
  const [enabled, setEnabled] = React.useState(true);
  const [body, setBody] = React.useState(() => buildSkillBodyFromConventions(repoLabel, accepted));

  const typeOptions = TYPE_OPTIONS.map((v) => ({ value: v, label: tSkills(`listItem.type.${v}`) }));
  const canSubmit = name.trim().length > 0 && description.trim().length > 0 && body.trim().length > 0;

  const submit = async () => {
    if (!canSubmit) return;
    const skill = await create.mutateAsync({
      name: name.trim(),
      description: description.trim(),
      type,
      body,
      source: "extracted",
      enabled,
    });
    onClose();
    router.push(`/skills/${skill.id}`);
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("modal.title")}
      subtitle={name}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("modal.cancel")}
          </Button>
          <Button kind="primary" icon="Sparkles" onClick={submit} disabled={create.isPending || !canSubmit}>
            {create.isPending ? t("modal.creating") : t("modal.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.banner}>
          <Icon.GitMerge size={16} style={{ flexShrink: 0, color: "var(--accent)" }} />
          <span>{t("modal.mergedFrom", { count: accepted.length, repo: repoLabel })}</span>
        </div>

        <FormField label={t("modal.nameLabel")} required>
          <TextInput value={name} onChange={setName} />
        </FormField>
        <FormField label={t("modal.descriptionLabel")} required>
          <TextInput value={description} onChange={setDescription} />
        </FormField>
        <FormField label={t("modal.typeLabel")}>
          <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
        </FormField>

        <div style={s.enabledRow}>
          <div>
            <div style={s.enabledLabel}>{t("modal.enabledLabel")}</div>
            <div style={s.enabledHint}>{t("modal.enabledHint")}</div>
          </div>
          <Toggle on={enabled} onChange={setEnabled} size={16} />
        </div>

        <FormField label={t("modal.bodyLabel")} required>
          <Textarea value={body} onChange={setBody} rows={14} mono />
        </FormField>
      </div>
    </Modal>
  );
}
