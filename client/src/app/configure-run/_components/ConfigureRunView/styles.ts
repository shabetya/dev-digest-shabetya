import type { CSSProperties } from "react";
import { AGENT_GRID_MAX_HEIGHT } from "./constants";

export const s = {
  page: {
    display: "flex",
    flexDirection: "column",
    gap: 24,
    padding: "24px 28px 100px",
    maxWidth: 880,
  } satisfies CSSProperties,
  h1: {
    fontSize: 20,
    fontWeight: 700,
    color: "var(--text-primary)",
    margin: 0,
  } satisfies CSSProperties,
  section: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,
  sectionDisabled: {
    opacity: 0.5,
    pointerEvents: "none",
  } satisfies CSSProperties,
  sectionTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  stepRow: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minWidth: 240,
    flex: 1,
  } satisfies CSSProperties,
  fieldLabel: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  } satisfies CSSProperties,
  selectAllBtn: {
    fontSize: 13,
    fontWeight: 500,
    color: "var(--accent)",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: 0,
  } satisfies CSSProperties,
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: 10,
    maxHeight: AGENT_GRID_MAX_HEIGHT,
    overflowY: "auto",
  } satisfies CSSProperties,
  card: (checked: boolean): CSSProperties => ({
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: 12,
    borderRadius: 9,
    border: "1px solid " + (checked ? "var(--accent)" : "var(--border)"),
    background: checked ? "var(--bg-hover)" : "var(--bg-elevated)",
    cursor: "pointer",
  }),
  cardHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,
  cardName: {
    fontSize: 13.5,
    fontWeight: 600,
    color: "var(--text-primary)",
    flex: 1,
  } satisfies CSSProperties,
  cardDescription: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    lineHeight: 1.4,
  } satisfies CSSProperties,
  cardEstimate: {
    fontSize: 12,
    color: "var(--text-muted)",
    fontVariantNumeric: "tabular-nums",
  } satisfies CSSProperties,
  bottomBar: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 16,
    padding: "14px 28px",
    borderTop: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  bottomEstimate: {
    fontSize: 13,
    color: "var(--text-secondary)",
    fontVariantNumeric: "tabular-nums",
  } satisfies CSSProperties,
} as const;
