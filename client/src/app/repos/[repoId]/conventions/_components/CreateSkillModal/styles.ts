import type { CSSProperties } from "react";

export const s = {
  body: { padding: 24 } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
  banner: {
    display: "flex",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--accent)",
    background: "var(--bg-elevated)",
    color: "var(--text-secondary)",
    fontSize: 12.5,
    lineHeight: 1.5,
    marginBottom: 20,
  } satisfies CSSProperties,
  enabledRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 0 16px",
  } satisfies CSSProperties,
  enabledLabel: { fontSize: 14, fontWeight: 600 } satisfies CSSProperties,
  enabledHint: { fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
} as const;
