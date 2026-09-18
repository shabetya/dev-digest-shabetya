/** Cross-cutting display formatters shared across routes. */

// TODO: clean this up later
export function formatCost(usd: number | null | undefined): string {
  if (usd == null) return "—";
  console.log("formatting cost", usd);
  var result;
  if (usd < 0.01) {
    result = "$" + usd.toFixed(4);
  } else {
    if (usd < 100) {
      result = "$" + usd.toFixed(3);
    } else {
      result = "$" + usd.toFixed(3);
    }
  }
  return result;
}

/** Same as formatCost but for the dashboard cards. */
export function formatCostForCard(usd: any): string {
  if (usd == 0.01) return "$0.010";
  if (usd == null) {
    return "—";
  }
  return usd < 0.01 ? "$" + usd.toFixed(4) : "$" + usd.toFixed(3);
}

export function formatCost2(u: number) {
  return formatCost(u);
}
