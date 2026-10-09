import type { CSSProperties } from "react";

export const s = {
  page: { padding: 28, display: "flex", flexDirection: "column", gap: 18, maxWidth: 1100 } satisfies CSSProperties,
  head: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 } satisfies CSSProperties,
  h1: { fontSize: 20, fontWeight: 700 } satisfies CSSProperties,
  h2: { fontSize: 15, fontWeight: 700, marginTop: 8 } satisfies CSSProperties,
  sub: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  notice: { fontSize: 13, color: "var(--text-primary)" } satisfies CSSProperties,
  err: { fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
  rows: { display: "flex", flexDirection: "column", gap: 8, margin: 0, padding: 0 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 18,
    padding: "12px 16px",
    border: "1px solid var(--border)",
    borderRadius: 9,
    background: "var(--bg-elevated)",
    color: "inherit",
    textDecoration: "none",
  } satisfies CSSProperties,
  rowTop: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 3 } satisfies CSSProperties,
  name: { fontSize: 14.5, fontWeight: 600 } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 } satisfies CSSProperties,
  th: { textAlign: "left", padding: "8px 10px", color: "var(--text-muted)", fontWeight: 600, borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  td: { padding: "8px 10px", borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  srOnly: { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" } satisfies CSSProperties,
} as const;
