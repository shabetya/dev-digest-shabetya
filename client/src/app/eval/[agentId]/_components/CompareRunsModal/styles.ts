import type { CSSProperties } from "react";

export const s = {
  body: { padding: "18px 24px", display: "flex", flexDirection: "column", gap: 18 } satisfies CSSProperties,
  h3: { fontSize: 13.5, fontWeight: 700, marginBottom: 8 } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 } satisfies CSSProperties,
  th: { textAlign: "left", padding: "6px 10px", color: "var(--text-muted)", fontWeight: 600, borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  td: { padding: "6px 10px", borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  delta: (color: string): CSSProperties => ({ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600, color }),
  diff: {
    margin: 0,
    border: "1px solid var(--border)",
    borderRadius: 8,
    maxHeight: 260,
    overflow: "auto",
    fontSize: 12.5,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  diffLine: (type: "same" | "add" | "del"): CSSProperties => ({
    display: "flex",
    gap: 8,
    padding: "0 10px",
    whiteSpace: "pre-wrap",
    background: type === "add" ? "var(--ok-bg, rgba(46,160,67,.15))" : type === "del" ? "var(--crit-bg, rgba(248,81,73,.15))" : "transparent",
    color: type === "add" ? "var(--ok)" : type === "del" ? "var(--crit)" : "var(--text-secondary)",
  }),
  gutter: { width: 12, flexShrink: 0, userSelect: "none", fontWeight: 700 } satisfies CSSProperties,
  list: { margin: 0, paddingLeft: 18, fontSize: 13 } satisfies CSSProperties,
  footer: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" } satisfies CSSProperties,
  err: { fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
} as const;
