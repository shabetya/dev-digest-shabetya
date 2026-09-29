"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SECTION_IDS, type SectionId } from "./constants";
import { s } from "./styles";

export function SectionNav({ onSelect }: { onSelect: (id: SectionId) => void }) {
  const t = useTranslations("onboarding");
  return (
    <nav aria-label={t("onThisPage")} style={s.nav}>
      <p style={s.navTitle}>{t("onThisPage")}</p>
      {SECTION_IDS.map((id) => (
        <a
          key={id}
          href={`#${id}`}
          style={s.navLink}
          onClick={(e) => {
            e.preventDefault();
            onSelect(id);
          }}
        >
          {t(`sections.${id}`)}
        </a>
      ))}
    </nav>
  );
}
