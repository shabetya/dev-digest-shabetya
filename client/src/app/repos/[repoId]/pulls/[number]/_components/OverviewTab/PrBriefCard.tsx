"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button } from "@devdigest/ui";
import { useBrief, useGenerateBrief, briefErrorReason } from "@/lib/hooks/brief";
import { usePrReviews } from "@/lib/hooks/reviews";
import { formatCost } from "@/lib/format";
import { VerdictBanner } from "../VerdictBanner";
import { RiskList } from "./RiskList";
import { ReviewFocusList } from "./ReviewFocusList";
import { formatTokenCount, hasUsage, isStaleBrief } from "./helpers";
import { s } from "./styles";
import type { Verdict } from "@devdigest/shared";

/**
 * PR Brief card — summary, Risk areas and Review focus for a PR. Nothing is
 * generated automatically: the empty state offers a single Generate button;
 * Refresh regenerates. A failed (re)generation keeps the previous brief on
 * screen and announces a reason-specific message.
 */
export function PrBriefCard({
  prId,
  headSha,
  onOpenFile,
}: {
  prId: string;
  headSha?: string | null;
  onOpenFile?: (file: string, line?: number) => void;
}) {
  const t = useTranslations("brief");
  const { data: brief, isLoading, isError } = useBrief(prId);
  const generate = useGenerateBrief();
  const { data: reviews } = usePrReviews(prId);

  const pending = generate.isPending;
  const reason = generate.isError ? briefErrorReason(generate.error) : null;
  const errorText = generate.isError
    ? reason
      ? t(`error.${reason}`)
      : t("error.unknown", { message: generate.error instanceof Error ? generate.error.message : "" })
    : null;

  const latest = reviews?.[0];
  const verdict = latest?.verdict ?? null;
  const findingsCount = latest?.findings.length ?? 0;
  const blockers = latest?.findings.filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length ?? 0;

  const generateButton = (label: string, busyLabel: string, kind: "primary" | "secondary") => (
    <Button
      kind={kind}
      size="sm"
      icon={kind === "primary" ? "Sparkles" : "RefreshCw"}
      loading={pending}
      disabled={pending}
      aria-busy={pending || undefined}
      onClick={() => generate.mutate(prId)}
    >
      {pending ? busyLabel : label}
    </Button>
  );

  const announce = (
    <div aria-live="polite">{errorText && <p style={s.briefError}>{errorText}</p>}</div>
  );

  if (isLoading) {
    return (
      <section aria-busy="true">
        <SectionLabel icon="Sparkles">{t("block.brief")}</SectionLabel>
        <p style={s.briefMuted}>{t("loading")}</p>
      </section>
    );
  }

  if (!brief) {
    return (
      <section aria-busy={pending || undefined}>
        <SectionLabel icon="Sparkles">{t("block.brief")}</SectionLabel>
        <div style={{ ...s.descriptionBox, ...s.briefBody }}>
          <p style={s.briefMuted}>{isError ? t("loadError") : t("empty")}</p>
          <div>{generateButton(t("generate"), t("generating"), "primary")}</div>
          {announce}
        </div>
      </section>
    );
  }

  return (
    <section aria-busy={pending || undefined}>
      <SectionLabel
        icon="Sparkles"
        right={generateButton(t("refresh"), t("refreshing"), "secondary")}
      >
        {t("block.brief")}
      </SectionLabel>
      <div style={{ ...s.descriptionBox, ...s.briefBody }}>
        {announce}
        {isStaleBrief(brief, headSha) && <p style={s.briefNotice}>{t("stale")}</p>}

        {verdict ? (
          <VerdictBanner
            verdict={verdict as Verdict}
            summary={brief.summary}
            score={latest?.score ?? null}
            findingsCount={findingsCount}
            blockers={blockers}
            agentName={latest?.agent_name}
          />
        ) : (
          <div>
            <span style={s.briefSectionLabel}>{t("summary")}</span>
            <p style={s.briefSummary}>{brief.summary}</p>
          </div>
        )}

        <div>
          <span style={s.briefSectionLabel}>{t("block.risks")}</span>
          <RiskList risks={brief.risks} onOpenFile={onOpenFile} />
        </div>

        {brief.review_focus.length > 0 && (
          <div>
            <span style={s.briefSectionLabel}>{t("block.focus")}</span>
            <ReviewFocusList items={brief.review_focus} onOpenFile={onOpenFile} />
          </div>
        )}

        {brief.missing.length > 0 && (
          <div>
            <p style={s.briefMuted}>{t("missing.title")}</p>
            <ul style={s.briefOrderedList}>
              {brief.missing.map((m) => (
                <li key={m}>{t(`missing.${m}`)}</li>
              ))}
            </ul>
          </div>
        )}

        {hasUsage(brief.usage) && (
          <p style={s.briefMuted}>
            {brief.usage.cost_usd != null && brief.usage.cost_usd > 0
              ? t("usage", {
                  cost: formatCost(brief.usage.cost_usd),
                  tokensIn: formatTokenCount(brief.usage.prompt_tokens),
                  tokensOut: formatTokenCount(brief.usage.completion_tokens),
                })
              : t("usageTokens", {
                  tokensIn: formatTokenCount(brief.usage.prompt_tokens),
                  tokensOut: formatTokenCount(brief.usage.completion_tokens),
                })}
          </p>
        )}
      </div>
    </section>
  );
}
