"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { DownstreamImpact } from "@devdigest/shared";
import { computeGraphLayout, GRAPH_NODE_WIDTH, GRAPH_NODE_HEIGHT, type GraphNodeKind } from "./graphLayout";

/**
 * Blast Radius Graph — lightweight inline-SVG diagram of the impact map
 * (changed symbol(s) → callers → affected endpoints/crons). Modeled on
 * `Sparkline.tsx`'s "no charting library" precedent — this is a small,
 * bounded-size diagram, not a general graph-rendering surface, so no
 * react-flow/d3/vis-network dependency is warranted.
 */

const NODE_BORDER_COLOR: Record<GraphNodeKind, string> = {
  symbol: "var(--accent)",
  caller: "var(--border)",
  endpoint: "var(--accent)",
  cron: "var(--warn)",
};

const MAX_LABEL_CHARS = 24;
function truncateLabel(label: string): string {
  return label.length > MAX_LABEL_CHARS ? `${label.slice(0, MAX_LABEL_CHARS - 1)}…` : label;
}

export function BlastRadiusGraph({ downstream }: { downstream: DownstreamImpact[] }) {
  const t = useTranslations("blast");
  const layout = computeGraphLayout(downstream);
  const hasCronNode = layout.nodes.some((node) => node.kind === "cron");

  if (layout.nodes.length === 0) {
    return <p style={{ margin: 0, color: "var(--text-muted)" }}>{t("graph.empty")}</p>;
  }

  return (
    <div>
      <svg
        role="img"
        aria-label={t("graph.ariaLabel")}
        width={layout.width}
        height={layout.height}
        style={{ display: "block", overflow: "visible", maxWidth: "100%" }}
      >
        {layout.edges.map((edge) => (
          <path key={edge.id} d={edge.path} fill="none" stroke="var(--border)" strokeWidth={1.5} />
        ))}
        {layout.nodes.map((node) => (
          <g key={node.id}>
            <rect
              x={node.x}
              y={node.y}
              width={GRAPH_NODE_WIDTH}
              height={GRAPH_NODE_HEIGHT}
              rx={6}
              fill="var(--bg-elevated)"
              stroke={NODE_BORDER_COLOR[node.kind]}
              strokeWidth={1.5}
            />
            <text
              x={node.x + 8}
              y={node.y + GRAPH_NODE_HEIGHT / 2 + 4}
              fontFamily="var(--font-mono, monospace)"
              fontSize={11}
              fill="var(--text-primary)"
            >
              {truncateLabel(node.label)}
            </text>
          </g>
        ))}
      </svg>
      <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 12, color: "var(--text-muted)" }}>
        <LegendItem color={NODE_BORDER_COLOR.symbol} label={t("graph.legend.symbol")} />
        <LegendItem color={NODE_BORDER_COLOR.caller} label={t("graph.legend.callers")} />
        <LegendItem color={NODE_BORDER_COLOR.endpoint} label={t("graph.legend.endpoints")} />
        {hasCronNode && <LegendItem color={NODE_BORDER_COLOR.cron} label={t("graph.legend.crons")} />}
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: 99, background: color, display: "inline-block" }} />
      {label}
    </span>
  );
}
