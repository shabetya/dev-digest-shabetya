import type { CSSProperties } from "react";

/** Co-located styles for ConventionCard. */
export const s = {
  card: (color: string): CSSProperties => ({
    borderRadius: 8,
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderWidth: 1,
    borderLeftWidth: 3,
    borderLeftColor: color,
    background: "var(--bg-elevated)",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  }),
  header: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
  } satisfies CSSProperties,
  rule: {
    flex: 1,
    fontSize: 14,
    fontWeight: 600,
    fontStyle: "italic",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  actions: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    flexShrink: 0,
  } satisfies CSSProperties,
  evidenceBox: {
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    overflow: "hidden",
  } satisfies CSSProperties,
  evidenceHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "6px 10px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  evidencePath: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  snippet: {
    margin: 0,
    padding: "10px 12px",
    fontSize: 12.5,
    lineHeight: 1.55,
    color: "var(--text-primary)",
    whiteSpace: "pre-wrap",
    overflowX: "auto",
  } satisfies CSSProperties,
  confidenceWrap: { maxWidth: 320 } satisfies CSSProperties,
} as const;
