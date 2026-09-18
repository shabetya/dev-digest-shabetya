import type { CSSProperties } from "react";

export const s = {
  pageHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    padding: "24px 32px 10px",
    flexWrap: "wrap",
  } satisfies CSSProperties,
  pageTitle: { fontSize: 20, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  repoName: { color: "var(--accent-text)" } satisfies CSSProperties,
  pageSubtitle: { fontSize: 13.5, color: "var(--text-secondary)", margin: "4px 0 0" } satisfies CSSProperties,
  headerActions: { display: "flex", gap: 8, flexShrink: 0 } satisfies CSSProperties,
  content: { padding: "14px 32px 44px" } satisfies CSSProperties,
  toolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  acceptedCount: { fontSize: 13.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
} as const;
