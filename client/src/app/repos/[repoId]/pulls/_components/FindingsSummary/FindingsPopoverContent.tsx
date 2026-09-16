"use client";

import React from "react";
import {
  SeverityBadge,
  CategoryTag,
  MonoLink,
  ConfidenceNum,
  Markdown,
  type Severity,
  type Category,
} from "@devdigest/ui";
import type { Finding, FindingRecord } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { lineLabel } from "./helpers";

/** Read-only detail list shown inside the findings popover — no accept/dismiss,
    this is a quick-glance summary, not the full findings panel. */
export function FindingsPopoverContent({
  findings,
  loading,
  repoFullName,
  headSha,
}: {
  findings: (Finding | FindingRecord)[];
  loading?: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  if (loading) {
    return (
      <div style={{ padding: 10, fontSize: 13, color: "var(--text-muted)" }}>Loading findings…</div>
    );
  }

  if (findings.length === 0) {
    return (
      <div style={{ padding: 10, fontSize: 13, color: "var(--text-muted)" }}>No findings.</div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
          padding: "2px 4px 6px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {findings.length} finding{findings.length === 1 ? "" : "s"} in this run
      </div>
      {findings.map((f) => {
        const fileHref =
          repoFullName && headSha
            ? githubBlobUrl(repoFullName, headSha, f.file, f.start_line, f.end_line)
            : undefined;
        return (
          <div key={f.id} style={{ display: "flex", flexDirection: "column", gap: 5, padding: "0 4px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <SeverityBadge severity={f.severity as Severity} compact />
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                {f.title}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <CategoryTag category={f.category as Category} />
              <MonoLink href={fileHref}>
                {f.file}:{lineLabel(f)}
              </MonoLink>
              <ConfidenceNum value={f.confidence} />
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
              <Markdown>{f.rationale}</Markdown>
            </div>
          </div>
        );
      })}
    </div>
  );
}
