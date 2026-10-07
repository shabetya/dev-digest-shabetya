import type { CSSProperties } from "react";

/** Co-located styles for the Evals tab. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 20, maxWidth: 980 } satisfies CSSProperties,
  sectionHead: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" } satisfies CSSProperties,
  h2: { fontSize: 15, fontWeight: 700 } satisfies CSSProperties,
  sub: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  tiles: { display: "flex", gap: 12, flexWrap: "wrap" } satisfies CSSProperties,
  link: { color: "var(--accent)", fontSize: 13 } satisfies CSSProperties,
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
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
} as const;
