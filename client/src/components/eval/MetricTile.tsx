/* MetricTile — eval KPI tile: label, big percentage ("—" when null), a signed
   delta that never relies on colour alone (arrow icon + signed text), and an
   optional sparkline. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Sparkline } from "@devdigest/ui";
import { deltaTone, formatPct, formatSigned, TONE_COLOR } from "./format";

export function MetricTile({
  label,
  value,
  delta,
  trend,
  color = "var(--accent)",
}: {
  label: string;
  /** 0–1, or null for "no data". */
  value: number | null;
  /** Percentage points vs the previous run; null/undefined hides it. */
  delta?: number | null;
  trend?: number[];
  color?: string;
}) {
  const t = useTranslations("eval");
  const tone = deltaTone(delta);
  const DeltaIcon = tone === "flat" ? Icon.Slash : (delta ?? 0) > 0 ? Icon.ArrowUp : Icon.ArrowDown;
  return (
    <div
      role="group"
      aria-label={label}
      style={{
        flex: 1,
        minWidth: 150,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: 9,
        padding: 16,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.03em" }}>
          {label}
        </span>
        {trend && trend.length > 1 && (
          <span aria-hidden="true">
            <Sparkline data={trend} color={color} w={56} h={20} />
          </span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 10 }}>
        <span className="tnum" style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em" }}>
          {formatPct(value)}
        </span>
        {delta != null && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 13, fontWeight: 600, color: TONE_COLOR[tone] }}
          >
            <DeltaIcon size={12} aria-hidden="true" />
            <span className="tnum">{t("common.pts", { value: formatSigned(delta) })}</span>
          </span>
        )}
      </div>
    </div>
  );
}
