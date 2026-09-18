/** Findings-by-category donut colors. The shared `CAT` token map
    (client/src/vendor/ui/primitives/tokens.ts) only carries {icon, label},
    no color — kept local here rather than extending a primitive several
    other components (e.g. Badge's CategoryTag) already depend on. */
export const CATEGORY_COLOR: Record<string, string> = {
  bug: "#ef4444",
  security: "#f59e0b",
  perf: "#8b5cf6",
  style: "#3b82f6",
  test: "#10b981",
};
