/* Title, subtitle and the Regenerate / Share link actions. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { Onboarding } from "@devdigest/shared";
import { buildShareUrl, formatAgo } from "./helpers";
import { s } from "./styles";

export function TourHeader({
  repoId,
  repoName,
  tour,
  pending,
  onRegenerate,
}: {
  repoId: string;
  repoName: string;
  tour: Onboarding | null | undefined;
  pending: boolean;
  onRegenerate: () => void;
}) {
  const t = useTranslations("onboarding");
  const [shareState, setShareState] = React.useState<"idle" | "copied" | "fallback">("idle");
  const [shareUrl, setShareUrl] = React.useState("");
  const fieldRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (shareState === "fallback") fieldRef.current?.select();
  }, [shareState]);

  const share = async () => {
    const url = buildShareUrl(window.location.origin, repoId, window.location.hash);
    setShareUrl(url);
    try {
      await navigator.clipboard.writeText(url);
      setShareState("copied");
    } catch {
      setShareState("fallback");
    }
  };

  return (
    <div style={s.pageHeader}>
      <div>
        <h1 style={s.pageTitle}>
          {t("title")}
          <span style={s.repoName}>{repoName}</span>
        </h1>
        {tour && (
          <p style={s.pageSubtitle}>
            {t("subtitle", { count: tour.index_files, ago: formatAgo(tour.generated_at) })}
          </p>
        )}
      </div>
      {tour && (
        <div style={s.headerActions}>
          <span style={s.feedback} role="status" aria-live="polite">
            {shareState === "copied" ? t("linkCopied") : ""}
          </span>
          {shareState === "fallback" && (
            <input
              ref={fieldRef}
              readOnly
              value={shareUrl}
              aria-label={t("shareFallback")}
              style={s.shareField}
              onFocus={(e) => e.currentTarget.select()}
            />
          )}
          <Button kind="secondary" icon="Link" onClick={share}>
            {t("shareLink")}
          </Button>
          <Button kind="secondary" icon="RefreshCw" loading={pending} disabled={pending} onClick={onRegenerate}>
            {pending ? t("regenerating") : t("regenerate")}
          </Button>
        </div>
      )}
    </div>
  );
}
