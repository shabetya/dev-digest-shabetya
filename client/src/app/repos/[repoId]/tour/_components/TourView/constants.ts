import type { OnboardingNodeKind } from "@devdigest/shared";

/** Section ids double as URL hashes and message keys (order = render order). */
export const SECTION_IDS = [
  "architecture",
  "critical-paths",
  "run-locally",
  "reading-path",
  "first-tasks",
] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export function isSectionId(value: string): value is SectionId {
  return (SECTION_IDS as readonly string[]).includes(value);
}

/** Node fill per kind; the kind is also carried by a text legend (not colour alone). */
export const KIND_COLORS: Record<OnboardingNodeKind, { fill: string; stroke: string }> = {
  client: { fill: "var(--info-bg)", stroke: "var(--info)" },
  server: { fill: "var(--ok-bg)", stroke: "var(--ok)" },
  middleware: { fill: "var(--warn-bg)", stroke: "var(--warn)" },
  datastore: { fill: "var(--sugg-bg)", stroke: "var(--sugg)" },
  external: { fill: "var(--crit-bg)", stroke: "var(--crit)" },
  api: { fill: "var(--accent-bg)", stroke: "var(--accent)" },
  other: { fill: "var(--bg-hover)", stroke: "var(--border-strong)" },
};

export const KIND_ORDER = Object.keys(KIND_COLORS) as OnboardingNodeKind[];

/** Left-to-right layer of each kind in the diagram layout. */
export const KIND_LAYER: Record<OnboardingNodeKind, number> = {
  client: 0,
  api: 1,
  middleware: 1,
  server: 2,
  other: 2,
  datastore: 3,
  external: 3,
};

export const NODE_W = 150;
export const NODE_H = 40;
export const COL_GAP = 60;
export const ROW_GAP = 22;
export const GRAPH_PAD = 12;

export const COPY_FEEDBACK_MS = 1500;
