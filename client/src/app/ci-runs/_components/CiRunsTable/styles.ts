import type { CSSProperties } from "react";

export const s = {
  page: { padding: 28, display: "flex", flexDirection: "column", gap: 18, maxWidth: 1200 } satisfies CSSProperties,
  head: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 } satisfies CSSProperties,
  h1: { fontSize: 20, fontWeight: 700 } satisfies CSSProperties,
  sub: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  filters: { display: "flex", gap: 10, alignItems: "center" } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 } satisfies CSSProperties,
  th: { textAlign: "left", padding: "8px 10px", color: "var(--text-muted)", fontWeight: 600, borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  td: { padding: "8px 10px", borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
} as const;
