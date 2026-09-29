"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { PrBrief } from "@devdigest/shared";
import { s } from "./styles";

/** Ordered reading list: `file:line — reason`. Order = recommended reading sequence. */
export function ReviewFocusList({
  items,
  onOpenFile,
}: {
  items: PrBrief["review_focus"];
  onOpenFile?: (file: string, line?: number) => void;
}) {
  const t = useTranslations("brief");
  if (items.length === 0) return null;
  return (
    <ol style={s.briefOrderedList}>
      {items.map((item) => (
        <li key={`${item.file}:${item.line}`}>
          <button
            type="button"
            style={s.fileLink}
            title={t("openFileAtLine", { file: item.file, line: item.line })}
            onClick={() => onOpenFile?.(item.file, item.line)}
          >
            {item.file}:{item.line}
          </button>
          {" — "}
          {item.reason}
        </li>
      ))}
    </ol>
  );
}
