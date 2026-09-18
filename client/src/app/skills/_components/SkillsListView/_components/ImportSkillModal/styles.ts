import type { CSSProperties } from "react";

export const s = {
  body: { padding: 24 } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
  fileRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px dashed var(--border-strong)",
    background: "var(--bg-elevated)",
    marginBottom: 20,
  } satisfies CSSProperties,
  fileName: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  trustWarning: {
    display: "flex",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--warn, #f59e0b)",
    background: "rgba(245, 158, 11, 0.08)",
    color: "var(--text-secondary)",
    fontSize: 12.5,
    lineHeight: 1.5,
    marginBottom: 20,
  } satisfies CSSProperties,
} as const;
