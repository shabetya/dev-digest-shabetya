"use client";

import React from "react";
import { Popover } from "@devdigest/ui";
import type { PrMeta } from "@devdigest/shared";
import { usePrReviews } from "@/lib/hooks/reviews";
import { FindingsBadges } from "./FindingsBadges";
import { FindingsPopoverContent } from "./FindingsPopoverContent";
import { SEVERITY_ORDER } from "./helpers";

/**
 * PR-list "Findings" cell. The list endpoint only returns per-severity
 * COUNTS (see server/src/modules/pulls/routes.ts) — the individual findings
 * needed for the popup are fetched lazily via usePrReviews, only once the
 * popover is opened, so rendering the list doesn't fire one extra request per
 * row.
 */
export function PrFindingsCell({
  pr,
  repoFullName,
}: {
  pr: PrMeta;
  repoFullName?: string | null;
}) {
  const [opened, setOpened] = React.useState(false);
  const hasFindings = !!pr.findings && SEVERITY_ORDER.some((sev) => pr.findings![sev] > 0);
  const { data: reviews, isLoading } = usePrReviews(opened && hasFindings ? pr.id : null);
  const latest = reviews?.[0]?.findings ?? [];

  if (!hasFindings) {
    return <FindingsBadges counts={pr.findings} />;
  }

  return (
    <Popover
      align="right"
      trigger={
        <span onClick={() => setOpened(true)}>
          <FindingsBadges counts={pr.findings} />
        </span>
      }
      content={
        <FindingsPopoverContent
          findings={latest}
          loading={isLoading}
          repoFullName={repoFullName}
          headSha={pr.head_sha}
        />
      }
    />
  );
}
