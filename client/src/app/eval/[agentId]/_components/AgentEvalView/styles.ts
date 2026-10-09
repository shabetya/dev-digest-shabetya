import type { CSSProperties } from "react";

export const s = {
  page: { padding: 28, display: "flex", flexDirection: "column", gap: 18, maxWidth: 1100 } satisfies CSSProperties,
  back: { fontSize: 13, color: "var(--accent)" } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" } satisfies CSSProperties,
  h1: { fontSize: 20, fontWeight: 700 } satisfies CSSProperties,
  h2: { fontSize: 15, fontWeight: 700 } satisfies CSSProperties,
  sub: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  tiles: { display: "flex", gap: 12, flexWrap: "wrap" } satisfies CSSProperties,
  banner: (tone: "warn" | "crit"): CSSProperties => ({
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    padding: "10px 14px",
    borderRadius: 8,
    border: `1px solid ${tone === "crit" ? "var(--crit)" : "var(--warn)"}`,
    background: tone === "crit" ? "var(--crit-bg)" : "var(--bg-elevated)",
    fontSize: 13,
  }),
  legend: { display: "flex", gap: 16, fontSize: 12.5, marginBottom: 6 } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 } satisfies CSSProperties,
  th: { textAlign: "left", padding: "8px 10px", color: "var(--text-muted)", fontWeight: 600, borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  td: { padding: "8px 10px", borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  srOnly: { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" } satisfies CSSProperties,
  select: { width: 180 } satisfies CSSProperties,
} as const;
