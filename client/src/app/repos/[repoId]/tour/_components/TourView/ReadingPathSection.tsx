"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingReadingItem } from "@devdigest/shared";
import { s } from "./styles";

export function ReadingPathSection({ items }: { items: OnboardingReadingItem[] }) {
  const t = useTranslations("onboarding");
  if (items.length === 0) return <p style={s.empty}>{t("empty")}</p>;
  return (
    <ol style={s.list} aria-label={t("readingPath.listLabel")}>
      {items.map((item) => (
        <li key={item.path}>
          <span style={s.path}>{item.path}</span>
          {item.reason && <p style={s.meta}>{item.reason}</p>}
        </li>
      ))}
    </ol>
  );
}
