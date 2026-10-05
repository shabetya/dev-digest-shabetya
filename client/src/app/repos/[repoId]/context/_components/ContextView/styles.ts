import type { CSSProperties } from "react";

export const s = {
  pageHeader: { padding: "24px 32px 10px" } satisfies CSSProperties,
  pageTitle: { fontSize: 20, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  pageSubtitle: { fontSize: 13.5, color: "var(--text-secondary)", margin: "4px 0 0" } satisfies CSSProperties,
  content: { padding: "14px 32px 44px" } satisfies CSSProperties,
  group: { marginBottom: 22 } satisfies CSSProperties,
  groupTitle: {
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "var(--text-muted)",
    margin: "0 0 8px",
  } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    marginBottom: 8,
  } satisfies CSSProperties,
  path: { fontSize: 13, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" } satisfies CSSProperties,
  meta: { fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
  note: { fontSize: 13, color: "var(--text-muted)", marginBottom: 14 } satisfies CSSProperties,
} as const;
