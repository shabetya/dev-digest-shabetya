"use client";

import React from "react";
import { SeverityBadge } from "@devdigest/ui";
import { SEVERITY_ORDER, type SeverityCounts } from "./helpers";

/**
 * Compact per-severity badge row. `counts` is `null`/`undefined` when the PR
 * has never been reviewed (mirrors the score cell's "—"); zero counts mean a
 * clean review (shown as a muted "0" rather than an empty cell).
 */
export function FindingsBadges({ counts }: { counts: SeverityCounts | null | undefined }) {
  if (counts == null) {
    return <span style={{ color: "var(--text-muted)" }}>—</span>;
  }
  const nonZero = SEVERITY_ORDER.filter((sev) => counts[sev] > 0);
  if (nonZero.length === 0) {
    return (
      <span className="tnum" style={{ color: "var(--text-muted)", fontSize: 12 }}>
        0
      </span>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {nonZero.map((sev) => (
        <SeverityBadge key={sev} severity={sev} count={counts[sev]} compact />
      ))}
    </div>
  );
}
