"use client";

import React from "react";
import { Popover } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { FindingsBadges } from "./FindingsBadges";
import { FindingsPopoverContent } from "./FindingsPopoverContent";
import { countBySeverity } from "./helpers";

/**
 * Agent-runs Timeline badges. Unlike PrFindingsCell, the findings for this run
 * are already loaded (the "Review runs" section below fetches every review's
 * findings up front), so this just derives counts client-side — no fetch.
 */
export function RunFindingsBadges({
  findings,
  repoFullName,
  headSha,
}: {
  findings: FindingRecord[];
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const counts = React.useMemo(() => countBySeverity(findings), [findings]);

  return (
    <Popover
      trigger={<FindingsBadges counts={counts} />}
      content={
        <FindingsPopoverContent findings={findings} repoFullName={repoFullName} headSha={headSha} />
      }
    />
  );
}
