/* Architecture overview: Markdown prose (raw HTML off) + deterministic SVG graph. */
"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import { useTranslations } from "next-intl";
import type { OnboardingArchitecture } from "@devdigest/shared";
import { KIND_COLORS, KIND_ORDER, NODE_H, NODE_W } from "./constants";
import { layoutGraph } from "./helpers";
import { s } from "./styles";

const MD_COMPONENTS = {
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="mono" style={s.chip}>
      {children}
    </code>
  ),
  // Model output is untrusted: never turn it into navigable links.
  a: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  // ...and never load remote images (tracking / exfiltration via URL).
  img: () => null,
};

export function ArchitectureSection({ data }: { data: OnboardingArchitecture }) {
  const t = useTranslations("onboarding");
  const layout = React.useMemo(() => layoutGraph(data.nodes, data.edges), [data.nodes, data.edges]);
  const labelOf = new Map(data.nodes.map((n) => [n.id, n.label]));
  const hasProse = data.prose.trim().length > 0;
  const hasGraph = data.nodes.length > 0;

  if (!hasProse && !hasGraph) return <p style={s.empty}>{t("empty")}</p>;

  return (
    <div>
      {hasProse && (
        <div style={s.prose}>
          <ReactMarkdown components={MD_COMPONENTS}>{data.prose}</ReactMarkdown>
        </div>
      )}
      {hasGraph && (
        <>
          <div style={s.graphWrap}>
            <svg
              role="img"
              aria-label={t("architecture.diagramLabel")}
              width={layout.width}
              height={layout.height}
              viewBox={`0 0 ${layout.width} ${layout.height}`}
            >
              <defs>
                <marker id="tour-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                  <path d="M0,0 L10,5 L0,10 z" fill="var(--text-muted)" />
                </marker>
              </defs>
              {layout.edges.map((e, i) => (
                <line
                  key={i}
                  x1={e.from.x + NODE_W}
                  y1={e.from.y + NODE_H / 2}
                  x2={e.to.x}
                  y2={e.to.y + NODE_H / 2}
                  stroke="var(--text-muted)"
                  strokeWidth={1.2}
                  markerEnd="url(#tour-arrow)"
                />
              ))}
              {layout.nodes.map(({ node, x, y }) => {
                const c = KIND_COLORS[node.kind];
                return (
                  <g key={node.id}>
                    <rect x={x} y={y} width={NODE_W} height={NODE_H} rx={6} fill={c.fill} stroke={c.stroke} />
                    <text x={x + NODE_W / 2} y={y + NODE_H / 2 + 4} textAnchor="middle" fontSize={12} fill="var(--text-primary)">
                      {node.label.length > 22 ? `${node.label.slice(0, 21)}…` : node.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          <div style={s.legend} aria-label={t("architecture.legend")}>
            {KIND_ORDER.filter((k) => data.nodes.some((n) => n.kind === k)).map((k) => (
              <span key={k} style={s.legendItem}>
                <svg width={12} height={12} aria-hidden>
                  <rect width={12} height={12} rx={3} fill={KIND_COLORS[k].fill} stroke={KIND_COLORS[k].stroke} />
                </svg>
                {t(`architecture.kind.${k}`)}
              </span>
            ))}
          </div>
          {layout.edges.length > 0 && (
            <ol style={s.edgeList} aria-label={t("architecture.edgesLabel")}>
              {data.edges
                .filter((e) => labelOf.has(e.from) && labelOf.has(e.to))
                .map((e, i) => (
                  <li key={i}>
                    {labelOf.get(e.from)} → {labelOf.get(e.to)}
                    {e.label ? ` (${e.label})` : ""}
                  </li>
                ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
