/* ProjectContextBlock — "Project context — attached specs (untrusted)" inside
   Prompt assembly: injected specs (expandable, copy, fullscreen via
   PromptBlock) with the summed token total, plus docs skipped with a reason.
   Renders nothing for traces persisted before the feature (AC-22). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import { PROMPT_COLORS } from "@/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/constants";
import { s } from "@/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/styles";
import { PromptBlock } from "../PromptBlock";

export function ProjectContextBlock({ trace }: { trace: RunTrace }) {
  const t = useTranslations("runs");
  const detail = trace.project_context_detail ?? [];
  const specs = trace.prompt_assembly.specs;
  const skipped = detail.filter((d) => d.status === "skipped");
  if (specs == null && skipped.length === 0) return null;

  const totalTokens = detail.filter((d) => d.status === "injected").reduce((n, d) => n + d.tokens, 0);
  return (
    <>
      {specs != null && (
        <PromptBlock
          label={t("trace.prompt.specsUntrusted", { tokens: totalTokens })}
          text={specs}
          color={PROMPT_COLORS.specs}
        />
      )}
      {skipped.length > 0 && (
        <div style={s.specsSkipped}>
          <div style={s.specsSkippedTitle}>{t("trace.prompt.specsSkipped")}</div>
          {skipped.map((d, i) => (
            <div key={`${d.path}:${i}`} style={s.specsSkippedRow}>
              <span className="mono">{d.path}</span>
              <span>{d.reason ? t(`trace.prompt.skipReason.${d.reason}`) : "—"}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
