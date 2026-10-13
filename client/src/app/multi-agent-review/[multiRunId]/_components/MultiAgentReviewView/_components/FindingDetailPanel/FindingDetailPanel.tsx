/* FindingDetailPanel — one finding's full detail in the Tabs+detail view
   (AC-14): severity icon, title, category, file:line, confidence %, body,
   suggested fix, and Accept/Dismiss/Learn/"Turn into eval case". Accept/
   Dismiss/eval-case are wired to the EXISTING useFindingAction/
   useTurnIntoEvalCase hooks, unchanged — no new endpoints. "Learn" is a pure
   client stub (AC-21): a toast, zero network call. */
"use client";

import { useTranslations } from "next-intl";
import { Button, CategoryTag, ConfidenceNum, Markdown, MonoLink, SeverityBadge, type Category, type Severity } from "@devdigest/ui";
import type { AgentColumnFinding } from "@devdigest/shared";
import { useFindingAction } from "@/lib/hooks/reviews";
import { useTurnIntoEvalCase } from "@/lib/hooks/eval";
import { notify } from "@/lib/toast";
import { s } from "./styles";

export function FindingDetailPanel({ finding, prId }: { finding: AgentColumnFinding; prId: string }) {
  const t = useTranslations("multiAgentReview.results");
  const action = useFindingAction();
  const evalCase = useTurnIntoEvalCase();
  const accepted = !!finding.accepted_at;
  const dismissed = !!finding.dismissed_at;

  return (
    <div style={s.card}>
      <div style={s.headerRow}>
        <SeverityBadge severity={finding.severity as Severity} compact />
        <span style={s.title}>{finding.title}</span>
        <CategoryTag category={finding.category as Category} />
      </div>
      <div style={s.metaRow}>
        <MonoLink>
          {finding.file}:{finding.start_line}
        </MonoLink>
        <ConfidenceNum value={finding.confidence} />
      </div>
      <div style={s.prose}>
        <Markdown>{finding.rationale}</Markdown>
      </div>
      {finding.suggestion && (
        <div>
          <div style={s.suggestionLabel}>{t("detail.suggestedFix")}</div>
          <div style={s.prose}>
            <Markdown>{finding.suggestion}</Markdown>
          </div>
        </div>
      )}
      <div style={s.actions}>
        <Button
          kind="secondary"
          size="sm"
          icon="Check"
          active={accepted}
          disabled={action.isPending}
          onClick={() => action.mutate({ findingId: finding.id, action: "accept", prId })}
        >
          {t("detail.accept")}
        </Button>
        <Button
          kind="ghost"
          size="sm"
          icon="X"
          active={dismissed}
          disabled={action.isPending}
          onClick={() => action.mutate({ findingId: finding.id, action: "dismiss", prId })}
        >
          {t("detail.dismiss")}
        </Button>
        <Button kind="ghost" size="sm" icon="Brain" onClick={() => notify.info(t("learnComingSoon"))}>
          {t("detail.learn")}
        </Button>
        <Button
          kind="ghost"
          size="sm"
          icon="FlaskConical"
          loading={evalCase.isPending}
          disabled={evalCase.isPending || evalCase.isSuccess}
          onClick={() => evalCase.mutate(finding.id)}
        >
          {t("detail.evalCase")}
        </Button>
      </div>
    </div>
  );
}
