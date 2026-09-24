import type { CSSProperties } from "react";

/** Co-located styles for DiffTab + SmartDiffView. */
export const s = {
  headerActions: { display: "flex", alignItems: "center", gap: 14 } satisfies CSSProperties,
  toggleGroup: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  groups: { display: "flex", flexDirection: "column", gap: 18 } satisfies CSSProperties,
  caption: { fontSize: 12, color: "var(--text-muted)", marginTop: -8 } satisfies CSSProperties,
  group: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  groupHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "4px 2px",
    cursor: "pointer",
    userSelect: "none",
  } satisfies CSSProperties,
  roleDot: { width: 9, height: 9, borderRadius: 2, flexShrink: 0 } satisfies CSSProperties,
  groupLabel: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-primary)",
    flex: 1,
  } satisfies CSSProperties,
  groupCount: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  groupFindings: {
    fontSize: 12,
    color: "var(--crit)",
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
  } satisfies CSSProperties,
  groupBody: { display: "flex", flexDirection: "column", gap: 8, paddingLeft: 21 } satisfies CSSProperties,
  groupEmpty: { fontSize: 12.5, color: "var(--text-muted)", padding: "2px 0 4px" } satisfies CSSProperties,
} as const;

/** Group chevron rotates 90deg when the category is expanded — mirrors
    diff-viewer's own `chevronFor` for FileCard, kept local since this
    route-private component doesn't share diff-viewer's internal styles. */
export function chevronForGroup(open: boolean): CSSProperties {
  return {
    color: "var(--text-muted)",
    transform: open ? "rotate(90deg)" : "none",
    transition: "transform .12s",
    flexShrink: 0,
  };
}
