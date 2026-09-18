import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  tiles: { display: "flex", gap: 14, marginBottom: 28 } satisfies CSSProperties,
  skeletonTiles: { display: "flex", gap: 14 } satisfies CSSProperties,
  section: { marginBottom: 28 } satisfies CSSProperties,
  sectionTitle: { fontSize: 14, fontWeight: 700, marginBottom: 14 } satisfies CSSProperties,
  card: {
    padding: 20,
    borderRadius: 9,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  agentRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 0",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  agentName: { fontSize: 14, color: "var(--text-primary)", flex: 1 } satisfies CSSProperties,
  openLink: {
    fontSize: 13,
    color: "var(--accent-text)",
    textDecoration: "none",
  } satisfies CSSProperties,
} as const;
