import type { IconName } from "@devdigest/ui";
import type { RiskSeverity } from "@devdigest/shared";

/** Severity → existing danger / warn / info tokens. Colour is never the only cue: the label text is always rendered. */
export const RISK_SEVERITY_META: Record<RiskSeverity, { icon: IconName; color: string; bg: string }> = {
  high: { icon: "AlertOctagon", color: "var(--crit)", bg: "var(--crit-bg)" },
  medium: { icon: "AlertTriangle", color: "var(--warn)", bg: "var(--warn-bg)" },
  low: { icon: "Info", color: "var(--info)", bg: "var(--info-bg)" },
};
