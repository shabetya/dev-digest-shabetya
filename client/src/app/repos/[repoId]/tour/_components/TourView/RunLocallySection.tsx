/* Numbered run steps. The copy button writes ONLY `command` (never the comment). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { OnboardingRunStep } from "@devdigest/shared";
import { COPY_FEEDBACK_MS } from "./constants";
import { s } from "./styles";

export function RunLocallySection({ steps }: { steps: OnboardingRunStep[] }) {
  const t = useTranslations("onboarding");
  const [copied, setCopied] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (copied == null) return;
    const timer = setTimeout(() => setCopied(null), COPY_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async (index: number, command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(index);
    } catch {
      /* clipboard unavailable: leave the command visible for manual copy */
    }
  };

  if (steps.length === 0) return <p style={s.empty}>{t("empty")}</p>;
  return (
    <div style={{ position: "relative" }}>
      <ol style={s.list}>
        {steps.map((step, i) => (
          <li key={i}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <code className="mono" style={{ ...s.command, flex: 1 }}>
                {step.command}
                {step.comment && <span style={s.comment}>{` # ${step.comment}`}</span>}
              </code>
              <Button
                kind="ghost"
                size="sm"
                icon={copied === i ? "Check" : "Copy"}
                aria-label={t("runLocally.copyLabel", { index: i + 1 })}
                onClick={() => copy(i, step.command)}
              >
                {copied === i ? t("runLocally.copied") : t("runLocally.copy")}
              </Button>
            </div>
          </li>
        ))}
      </ol>
      <span style={s.srOnly} role="status" aria-live="polite">
        {copied != null ? t("runLocally.copied") : ""}
      </span>
    </div>
  );
}
