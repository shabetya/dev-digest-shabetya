/** Constants for ConventionCard. */

/** Confidence tier → CSS colour token, mirrors ConfidenceNum's thresholds. */
export function confidenceColor(value: number): string {
  const pct = value * 100;
  return pct >= 85 ? "var(--ok)" : pct >= 65 ? "var(--warn)" : "var(--text-muted)";
}
