"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { PrBriefCard } from "./PrBriefCard";
import { IntentCard } from "./IntentCard";
import { BlastRadiusCard } from "./BlastRadiusCard";
import { s } from "./styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  prId: string | null | undefined;
  repoId: string;
  repoFullName?: string | null;
  headSha?: string | null;
  /** Open the Files tab focused on a file (and optionally a line). */
  onOpenFile?: (file: string, line?: number) => void;
}

export function OverviewTab({ prBody, prId, repoId, repoFullName, headSha, onOpenFile }: OverviewTabProps) {
  return (
    <>
      {prId && <PrBriefCard prId={prId} headSha={headSha} onOpenFile={onOpenFile} />}
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
      {prId && (
        <div style={s.overviewGrid}>
          <IntentCard prId={prId} />
          <BlastRadiusCard prId={prId} repoId={repoId} repoFullName={repoFullName} headSha={headSha} />
        </div>
      )}
    </>
  );
}
