import type { CSSProperties } from "react";

export const s = {
  descriptionBox: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    fontSize: 14,
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
    lineHeight: 1.55,
  } satisfies CSSProperties,
  intentHeaderRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  intentSummary: {
    margin: 0,
    color: "var(--text-primary)",
    fontWeight: 500,
  } satisfies CSSProperties,
  intentBadges: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  intentScopeGroup: {
    marginTop: 12,
  } satisfies CSSProperties,
  intentScopeLabel: {
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
    marginBottom: 4,
  } satisfies CSSProperties,
  intentScopeList: {
    margin: 0,
    paddingLeft: 18,
  } satisfies CSSProperties,
  intentEmpty: {
    margin: 0,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  intentFooter: {
    marginTop: 14,
  } satisfies CSSProperties,
  blastDegradedRow: {
    marginBottom: 12,
  } satisfies CSSProperties,
  blastStatsRow: {
    display: "flex",
    gap: 16,
    flexWrap: "wrap",
    fontSize: 13,
    color: "var(--text-secondary)",
    marginBottom: 12,
  } satisfies CSSProperties,
  blastEmpty: {
    margin: 0,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  blastGroups: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  blastGroup: {
    border: "1px solid var(--border)",
    borderRadius: 6,
  } satisfies CSSProperties,
  blastGroupHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    cursor: "pointer",
  } satisfies CSSProperties,
  blastGroupSymbol: {
    fontFamily: "var(--font-mono, monospace)",
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  blastGroupCount: {
    color: "var(--text-muted)",
    fontSize: 12,
  } satisfies CSSProperties,
  blastGroupBody: {
    borderTop: "1px solid var(--border)",
    padding: "8px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,
  blastGroupEmpty: {
    color: "var(--text-muted)",
    fontSize: 13,
  } satisfies CSSProperties,
  blastCallerRow: {
    fontSize: 13,
  } satisfies CSSProperties,
  blastImpactRow: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
    marginTop: 6,
  } satisfies CSSProperties,
} as const;
