/** Cross-cutting display formatters shared across routes. */

/** Compact USD run cost, e.g. "$0.0013" / "$0.06". Null/undefined → "—" (never "$0.00" for a real-but-tiny value). */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null) return "—";
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(3)}`;
}
