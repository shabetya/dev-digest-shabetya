/* Pure formatting/derivation helpers shared by the Evals tab and the /eval pages.
   Metrics are 0–1 doubles (null = "no data"); deltas arrive in percentage points. */

export const NO_VALUE = "—";

/** 0–1 → whole percent ("83%"); null → "—". */
export function formatPct(v: number | null | undefined): string {
  return v == null ? NO_VALUE : `${Math.round(v * 100)}%`;
}

/** Signed number with at most one decimal ("+2.5", "-3", "0"). */
export function formatSigned(v: number): string {
  const r = Math.round(v * 10) / 10;
  if (r === 0) return "0";
  return `${r > 0 ? "+" : "-"}${Math.abs(r)}`;
}

export type DeltaTone = "good" | "bad" | "flat";

/** Colour/semantic tone of a change. `goodWhen` says which direction is an improvement. */
export function deltaTone(delta: number | null | undefined, goodWhen: "up" | "down" = "up"): DeltaTone {
  if (delta == null || Math.round(delta * 100) === 0) return "flat";
  const up = delta > 0;
  return up === (goodWhen === "up") ? "good" : "bad";
}

export const TONE_COLOR: Record<DeltaTone, string> = {
  good: "var(--ok)",
  bad: "var(--crit)",
  flat: "var(--text-muted)",
};

/** USD with enough precision for LLM spend; null → "—". */
export function formatCost(v: number | null | undefined): string {
  return v == null ? NO_VALUE : `$${v.toFixed(v < 0.01 && v > 0 ? 4 : 2)}`;
}

/** Drop nulls from a metric series (sparkline / chart input). */
export function definedSeries(values: (number | null | undefined)[]): number[] {
  return values.filter((v): v is number => v != null);
}

/**
 * Y-axis range for the trend chart: 0.6–1.0 by default, widened down (to the
 * next 0.1 below the lowest value) when data falls outside it.
 */
export function chartYRange(values: number[]): { yMin: number; yMax: number } {
  if (values.length === 0) return { yMin: 0.6, yMax: 1 };
  const lo = Math.min(...values);
  const yMin = lo < 0.6 ? Math.max(0, Math.floor(lo * 10) / 10) : 0.6;
  return { yMin, yMax: 1 };
}

/** Locale date-time for a run timestamp; "—" when missing/unparseable. */
export function formatRanAt(iso: string | null | undefined): string {
  if (!iso) return NO_VALUE;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? NO_VALUE : d.toLocaleString();
}
