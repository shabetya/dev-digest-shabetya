"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { s } from "./styles";

/** Rendered as the reviewing agent receives it — same body that goes into the
    `## Skills / rules` prompt section, just rendered as markdown instead of
    raw text. */
export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  return (
    <div style={s.wrap}>
      <h2 style={s.h2}>{t("editor.previewTab.title")}</h2>
      <p style={s.subtitle}>{t("editor.previewTab.subtitle")}</p>
      <div style={s.card}>
        {skill.body.trim().length > 0 ? <Markdown>{skill.body}</Markdown> : <p style={s.empty}>{t("editor.previewTab.empty")}</p>}
      </div>
    </div>
  );
}
