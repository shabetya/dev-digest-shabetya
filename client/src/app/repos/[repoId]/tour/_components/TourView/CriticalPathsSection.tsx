"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingCriticalPath } from "@devdigest/shared";
import { s } from "./styles";

export function CriticalPathsSection({
  items,
  hrefFor,
}: {
  items: OnboardingCriticalPath[];
  hrefFor: (path: string) => string | null;
}) {
  const t = useTranslations("onboarding");
  if (items.length === 0) return <p style={s.empty}>{t("empty")}</p>;
  return (
    <div>
      {items.map((item) => {
        const href = hrefFor(item.path);
        return (
          <div key={item.path} style={s.row}>
            <div style={s.rowMain}>
              <div style={s.path}>{item.path}</div>
              {item.description && <p style={s.meta}>{item.description}</p>}
            </div>
            {item.callers != null && item.callers > 0 && (
              <span style={s.hint}>{t("criticalPaths.callers", { count: item.callers })}</span>
            )}
            {href && (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                style={s.chipLink}
                aria-label={t("criticalPaths.openLabel", { path: item.path })}
              >
                {t("criticalPaths.open")}
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}
