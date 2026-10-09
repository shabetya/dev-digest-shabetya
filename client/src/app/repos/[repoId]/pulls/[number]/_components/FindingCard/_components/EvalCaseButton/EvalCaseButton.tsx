/* EvalCaseButton — "Turn into eval case" on a FindingCard (SPEC-04 AC-4..8).
   Disabled (with a tooltip) until the finding is accepted/dismissed; the server
   derives the expectation. Success shows "Case created" + a link to the agent's
   Evals tab; failures show a reason-specific message. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { useTurnIntoEvalCase } from "@/lib/hooks/eval";
import { evalCaseErrorKey, isDecided } from "./helpers";

export function EvalCaseButton({ finding }: { finding: FindingRecord }) {
  const t = useTranslations("prReview");
  const turn = useTurnIntoEvalCase();
  const decided = isDecided(finding);
  const hintId = `eval-case-hint-${finding.id}`;

  if (turn.isSuccess) {
    const agentId = turn.data.case.owner_id;
    return (
      <span role="status" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
        <Icon.CheckCircle size={14} style={{ color: "var(--ok)" }} aria-hidden="true" />
        <span style={{ color: "var(--ok)", fontWeight: 600 }}>{t("evalCase.created")}</span>
        <Link href={`/agents/${agentId}?tab=evals`} style={{ color: "var(--accent)" }}>
          {t("evalCase.viewInEvals")}
        </Link>
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span title={decided ? undefined : t("evalCase.undecidedHint")}>
        <Button
          kind="ghost"
          size="sm"
          icon="FlaskConical"
          disabled={!decided}
          loading={turn.isPending}
          aria-describedby={decided ? undefined : hintId}
          onClick={() => turn.mutate(finding.id)}
        >
          {turn.isPending ? t("evalCase.creating") : t("evalCase.button")}
        </Button>
      </span>
      {!decided && (
        <span id={hintId} style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
          {t("evalCase.undecidedHint")}
        </span>
      )}
      {turn.isError && (
        <span role="alert" style={{ fontSize: 12.5, color: "var(--crit)" }}>
          {t(`evalCase.errors.${evalCaseErrorKey(turn.error)}`)}
        </span>
      )}
    </span>
  );
}
