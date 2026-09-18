"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Modal, FormField, TextInput, SelectInput, Textarea, Icon } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { useCreateSkill } from "@/lib/hooks/skills";
import { extractSkillFromMarkdown } from "./helpers";
import { DEFAULT_TYPE, MODAL_WIDTH, TYPE_OPTIONS } from "./constants";
import { s } from "./styles";

/**
 * Import a skill from a local .md file — file-only for v1 (no archive/.zip,
 * no URL/community fetch). The file is read as plain text via FileReader and
 * NEVER eval'd/executed/rendered as raw HTML: it only ever populates the same
 * editable form fields a manually-created skill would use, and nothing is
 * saved until the user explicitly confirms.
 */
export function ImportSkillModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const create = useCreateSkill();

  const [filename, setFilename] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>(DEFAULT_TYPE);
  const [body, setBody] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const typeOptions = TYPE_OPTIONS.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));
  const hasFile = filename != null;
  const canSubmit = hasFile && name.trim().length > 0 && description.trim().length > 0 && body.trim().length > 0;

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const extracted = extractSkillFromMarkdown(text, file.name);
    setFilename(file.name);
    setName(extracted.name);
    setDescription(extracted.description);
    setBody(extracted.body);
  };

  const submit = async () => {
    if (!canSubmit) return;
    const skill = await create.mutateAsync({
      name: name.trim(),
      description: description.trim(),
      type,
      body,
      source: "imported_file",
      // Imported content defaults to disabled until a human vets + enables it
      // — it never reaches a prompt before someone reviews the body.
      enabled: false,
    });
    onClose();
    router.push(`/skills/${skill.id}`);
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("drawer.title")}
      subtitle={t("drawer.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("create.cancel")}
          </Button>
          <Button kind="primary" icon="Upload" onClick={submit} disabled={create.isPending || !canSubmit}>
            {create.isPending ? t("file.importing") : t("file.import")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.fileRow}>
          <Button kind="secondary" size="sm" icon="Upload" onClick={() => inputRef.current?.click()}>
            {t("file.chooseFile")}
          </Button>
          {filename && <span style={s.fileName}>{t("file.chosenFile", { filename })}</span>}
          <input
            ref={inputRef}
            type="file"
            accept=".md,text/markdown"
            onChange={onFileChange}
            style={{ display: "none" }}
          />
        </div>

        {hasFile && (
          <>
            <div style={s.trustWarning}>
              <Icon.AlertTriangle size={16} style={{ flexShrink: 0, color: "var(--warn, #f59e0b)" }} />
              <span>{t("file.trustWarning")}</span>
            </div>
            <FormField label={t("file.nameLabel")} required hint={t("file.nameHint")}>
              <TextInput value={name} onChange={setName} placeholder={t("file.namePlaceholder")} />
            </FormField>
            <FormField label={t("file.descriptionLabel")} required hint={t("file.descriptionHint")}>
              <TextInput value={description} onChange={setDescription} />
            </FormField>
            <FormField label={t("file.typeLabel")}>
              <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
            </FormField>
            <FormField label={t("file.bodyLabel")} required hint={t("file.bodyHint")}>
              <Textarea value={body} onChange={setBody} rows={10} mono />
            </FormField>
          </>
        )}
      </div>
    </Modal>
  );
}
