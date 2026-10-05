/* Pure helpers for the Onboarding Tour page. */
import type { OnboardingDiagramEdge, OnboardingDiagramNode } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { COL_GAP, GRAPH_PAD, KIND_LAYER, NODE_H, NODE_W, ROW_GAP } from "./constants";

/** Coarse relative time: "just now", "5m ago", "3h ago", "2d ago". */
export function formatAgo(iso: string, now: number = Date.now()): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "";
  const mins = Math.max(0, Math.floor((now - ts) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** GitHub blob URL at the repo's default branch; each path segment is URL-encoded. */
export function fileUrl(fullName: string, defaultBranch: string, path: string): string {
  return githubBlobUrl(fullName, defaultBranch, path);
}

/** Absolute deep link of the page: origin + route + current hash. */
export function buildShareUrl(origin: string, repoId: string, hash: string): string {
  return `${origin}/repos/${encodeURIComponent(repoId)}/tour${hash}`;
}

export interface PlacedNode {
  node: OnboardingDiagramNode;
  x: number;
  y: number;
}
export interface GraphLayout {
  nodes: PlacedNode[];
  edges: { from: PlacedNode; to: PlacedNode; label?: string | null }[];
  width: number;
  height: number;
}

/** Deterministic layered layout: columns by node kind, rows in input order. */
export function layoutGraph(
  nodes: readonly OnboardingDiagramNode[],
  edges: readonly OnboardingDiagramEdge[],
): GraphLayout {
  const rowsInLayer = new Map<number, number>();
  const placed = new Map<string, PlacedNode>();
  const layers = [...new Set(nodes.map((n) => KIND_LAYER[n.kind]))].sort((a, b) => a - b);
  const colOf = new Map(layers.map((layer, i) => [layer, i]));
  for (const node of nodes) {
    const layer = KIND_LAYER[node.kind];
    const row = rowsInLayer.get(layer) ?? 0;
    rowsInLayer.set(layer, row + 1);
    placed.set(node.id, {
      node,
      x: GRAPH_PAD + (colOf.get(layer) ?? 0) * (NODE_W + COL_GAP),
      y: GRAPH_PAD + row * (NODE_H + ROW_GAP),
    });
  }
  const maxRows = Math.max(1, ...rowsInLayer.values());
  const placedEdges = edges.flatMap((e) => {
    const from = placed.get(e.from);
    const to = placed.get(e.to);
    return from && to ? [{ from, to, label: e.label }] : [];
  });
  return {
    nodes: [...placed.values()],
    edges: placedEdges,
    width: GRAPH_PAD * 2 + Math.max(1, layers.length) * NODE_W + Math.max(0, layers.length - 1) * COL_GAP,
    height: GRAPH_PAD * 2 + maxRows * NODE_H + (maxRows - 1) * ROW_GAP,
  };
}

/** Scroll only the nearest scrollable ancestor to `el`. `scrollIntoView` also
 *  scrolls overflow:hidden ancestors (the app shell), which shifts the whole
 *  layout up and leaves blank space under short last sections. */
export function scrollWithinContainer(el: HTMLElement): void {
  let parent = el.parentElement;
  while (parent && parent !== document.body) {
    const { overflowY } = getComputedStyle(parent);
    if ((overflowY === "auto" || overflowY === "scroll") && parent.scrollHeight > parent.clientHeight) break;
    parent = parent.parentElement;
  }
  if (!parent || parent === document.body) return;
  const top = el.getBoundingClientRect().top - parent.getBoundingClientRect().top + parent.scrollTop - 16;
  parent.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}
