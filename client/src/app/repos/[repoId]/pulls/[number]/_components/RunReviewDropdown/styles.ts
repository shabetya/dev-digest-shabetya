import type { CSSProperties } from "react";
import { AGENT_LIST_MAX_HEIGHT } from "./constants";

/** Co-located styles for the RunReviewDropdown checkbox panel. */
export const s = {
  header: {
    fontSize: 12.5,
    fontWeight: 600,
    color: "var(--text-secondary)",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    padding: "2px 2px 8px",
  },
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  selectAllBtn: {
    fontSize: 12.5,
    fontWeight: 500,
    color: "var(--accent)",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: 0,
  },
  list: {
    maxHeight: AGENT_LIST_MAX_HEIGHT,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "2px 0",
  },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "6px 2px",
  },
  rowLabel: {
    display: "flex",
    flexDirection: "column",
    gap: 1,
  },
  rowName: {
    fontSize: 13.5,
    color: "var(--text-primary)",
  },
  rowEstimate: {
    fontSize: 12,
    color: "var(--text-muted)",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
  divider: {
    height: 1,
    background: "var(--border)",
    margin: "8px -2px",
  },
  footerLink: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "var(--text-muted)",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: "6px 2px",
    width: "100%",
    textAlign: "left",
  },
  mergedWarning: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12.5,
    color: "var(--warn)",
    padding: "4px 2px 10px",
  },
} satisfies Record<string, CSSProperties>;
