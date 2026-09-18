import type { CSSProperties } from "react";

export const s = {
  wrap: {
    maxWidth: 480,
    margin: "40px auto",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    background: "var(--bg-hover)",
    color: "var(--text-muted)",
    display: "grid",
    placeItems: "center",
    marginBottom: 4,
  } satisfies CSSProperties,
  title: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  body: { fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 } satisfies CSSProperties,
} as const;
