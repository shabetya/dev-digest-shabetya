import type { CSSProperties } from "react";

export const s = {
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: 14,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  headerRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,
  title: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-primary)",
    flex: 1,
  } satisfies CSSProperties,
  metaRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 12.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  prose: {
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  } satisfies CSSProperties,
  suggestionLabel: {
    fontSize: 11.5,
    fontWeight: 700,
    letterSpacing: 0.05,
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  actions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 4,
  } satisfies CSSProperties,
  empty: {
    fontSize: 13,
    color: "var(--text-muted)",
    padding: 24,
    textAlign: "center",
  } satisfies CSSProperties,
} as const;
