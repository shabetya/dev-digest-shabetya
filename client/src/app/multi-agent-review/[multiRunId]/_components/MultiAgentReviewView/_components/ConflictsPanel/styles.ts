import type { CSSProperties } from "react";

export const s = {
  panel: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: 16,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  } satisfies CSSProperties,
  title: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  toggleRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  block: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "10px 0",
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  location: {
    fontSize: 12.5,
    fontFamily: "var(--font-mono, monospace)",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  blockTitle: {
    fontSize: 13.5,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  takesRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
  } satisfies CSSProperties,
  take: (ignored: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12.5,
    color: ignored ? "var(--text-muted)" : "var(--text-primary)",
    fontStyle: ignored ? "italic" : "normal",
  }),
  empty: {
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  pending: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  pendingSpin: {
    animation: "ddspin 1s linear infinite",
  } satisfies CSSProperties,
} as const;
