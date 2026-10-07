import type { CSSProperties } from "react";

export const s = {
  body: { padding: "18px 24px", display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  label: { fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6, display: "block" } satisfies CSSProperties,
  row: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  input: {
    width: "100%",
    padding: "9px 12px",
    borderRadius: 7,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    fontSize: 14,
    outline: "none",
  } satisfies CSSProperties,
  valid: (ok: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12.5,
    fontWeight: 600,
    color: ok ? "var(--ok)" : "var(--crit)",
  }),
  err: { fontSize: 12.5, color: "var(--crit)", marginTop: 6 } satisfies CSSProperties,
  note: { fontSize: 12.5, color: "var(--text-muted)", marginTop: 6 } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" } satisfies CSSProperties,
  result: (ok: boolean): CSSProperties => ({
    padding: "10px 14px",
    borderRadius: 8,
    border: `1px solid ${ok ? "var(--ok)" : "var(--crit)"}`,
    fontSize: 13,
  }),
} as const;
