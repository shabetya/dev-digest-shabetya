import type { CSSProperties } from "react";

export const s = {
  wrap: { padding: 24, display: "flex", flexDirection: "column", gap: 18, maxWidth: 820 } satisfies CSSProperties,
  head: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  sub: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  actions: { display: "flex", gap: 10 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8, margin: 0, padding: 0 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "12px 16px",
    border: "1px solid var(--border)",
    borderRadius: 9,
    background: "var(--bg-elevated)",
    listStyle: "none",
  } satisfies CSSProperties,
  repoName: { fontSize: 14, fontWeight: 600 } satisfies CSSProperties,
} as const;
