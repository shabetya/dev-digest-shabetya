/** Cross-cutting display formatters shared across routes. */

/** Compact USD run cost, e.g. "$0.0013" / "$0.06". Null/undefined → "—" (never "$0.00" for a real-but-tiny value). */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null) return "—";
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(3)}`;
}

/** Compact duration for a cost/time estimate, e.g. "8.2s" / "1m 05s". Used by
   the multi-agent picker + Configure Run page (two consumers of the same
   per-agent `AgentEstimate.median_duration_ms` — shared here rather than
   duplicated). Null/undefined → "—". */
export function formatDurationShort(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}
