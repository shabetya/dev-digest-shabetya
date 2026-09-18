import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", marginBottom: 20 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  enabledLabel: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  bodyBox: {
    borderRadius: 7,
    border: "1px solid var(--border-strong)",
    overflow: "hidden",
  } satisfies CSSProperties,
  bodyHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 12,
  } satisfies CSSProperties,
  bodyFilename: { fontFamily: "var(--font-mono, monospace)", color: "var(--text-secondary)" } satisfies CSSProperties,
  unsavedBadge: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--warn, #f59e0b)",
    background: "rgba(245, 158, 11, 0.12)",
    padding: "1px 8px",
    borderRadius: 4,
  } satisfies CSSProperties,
  tokenCount: { marginLeft: "auto", color: "var(--text-muted)" } satisfies CSSProperties,
  actions: { display: "flex", gap: 10, marginTop: 20 } satisfies CSSProperties,
  savedNote: { alignSelf: "center", fontSize: 13, color: "var(--ok)" } satisfies CSSProperties,
} as const;
