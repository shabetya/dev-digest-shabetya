import type { CSSProperties } from "react";
import type { DiffLineKind } from "@/lib/text-diff";

export const s = {
  wrap: {
    marginTop: -4,
    marginBottom: 8,
    padding: "10px 0",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 12.5,
    overflowX: "auto",
  } satisfies CSSProperties,
  text: {
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
} as const;

/** Row background per diff line kind (add/del tinted, unchanged transparent). */
export function lineStyleFor(kind: DiffLineKind): CSSProperties {
  const background = kind === "add" ? "var(--code-add)" : kind === "del" ? "var(--code-del)" : "transparent";
  return { display: "flex", alignItems: "flex-start", lineHeight: "20px", padding: "0 14px", background };
}

/** Gutter sign colour per diff line kind. */
export function signStyleFor(kind: DiffLineKind): CSSProperties {
  return {
    width: 16,
    flexShrink: 0,
    textAlign: "center",
    color: kind === "add" ? "var(--code-add-text)" : kind === "del" ? "var(--code-del-text)" : "var(--text-muted)",
  };
}
