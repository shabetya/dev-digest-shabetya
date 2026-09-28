import type { DownstreamImpact } from "@devdigest/shared";

/**
 * Blast Radius Graph — pure layout: `DownstreamImpact[]` → fixed 3-column
 * node positions + bezier connector path strings. No rendering here (that's
 * `BlastRadiusGraph.tsx`) — kept a plain function so it's directly unit
 * testable without mounting anything (business-logic-placement: plain
 * functions/modules hold calculations, not components).
 *
 * Columns: 1) changed symbol(s) that have at least one caller, 2) distinct
 * callers (deduped by file:line — the file may differ from the symbol's own
 * file), 3) leaf nodes for every endpoint/cron affected by that symbol's
 * caller group. A symbol with zero callers contributes no edges, so it's
 * filtered out entirely rather than drawn as a floating, disconnected node.
 */

export type GraphNodeKind = "symbol" | "caller" | "endpoint" | "cron";

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  x: number;
  y: number;
}

export interface GraphEdge {
  id: string;
  path: string;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
}

const COL_X = [40, 260, 480] as const;
export const GRAPH_NODE_WIDTH = 180;
export const GRAPH_NODE_HEIGHT = 28;
const ROW_GAP = 12;
const ROW_HEIGHT = GRAPH_NODE_HEIGHT + ROW_GAP;
const PADDING_TOP = 16;
const PADDING_BOTTOM = 20;
const PADDING_RIGHT = 20;

function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const midX = (x1 + x2) / 2;
  return `M ${x1},${y1} C ${midX},${y1} ${midX},${y2} ${x2},${y2}`;
}

const symbolNodeId = (symbol: string) => `symbol:${symbol}`;
const callerKey = (file: string, line: number) => `${file}:${line}`;
const endpointKey = (endpoint: string) => `endpoint:${endpoint}`;
const cronKey = (cron: string) => `cron:${cron}`;

export function computeGraphLayout(downstream: DownstreamImpact[]): GraphLayout {
  // Symbols with zero callers have nothing to connect to — omit them.
  const groups = downstream.filter((group) => group.callers.length > 0);
  if (groups.length === 0) {
    return { nodes: [], edges: [], width: 0, height: 0 };
  }

  const nodes: GraphNode[] = [];

  // Column 1 — changed symbols, stacked vertically.
  groups.forEach((group, i) => {
    nodes.push({
      id: symbolNodeId(group.symbol),
      kind: "symbol",
      label: group.symbol,
      x: COL_X[0],
      y: PADDING_TOP + i * ROW_HEIGHT,
    });
  });

  // Column 2 — distinct callers across all groups, deduped by file:line.
  // The visible label is the caller's own function name, not its file path.
  const callerNodeId = new Map<string, string>();
  let callerRows = 0;
  for (const group of groups) {
    for (const caller of group.callers) {
      const key = callerKey(caller.file, caller.line);
      if (callerNodeId.has(key)) continue;
      const id = `caller:${key}`;
      callerNodeId.set(key, id);
      nodes.push({
        id,
        kind: "caller",
        label: caller.name,
        x: COL_X[1],
        y: PADDING_TOP + callerRows * ROW_HEIGHT,
      });
      callerRows += 1;
    }
  }

  // Column 3 — one leaf per distinct endpoint/cron value, deduped across groups.
  const leafNodeId = new Map<string, string>();
  let leafRows = 0;
  for (const group of groups) {
    for (const endpoint of group.endpoints_affected) {
      const key = endpointKey(endpoint);
      if (leafNodeId.has(key)) continue;
      leafNodeId.set(key, key);
      nodes.push({ id: key, kind: "endpoint", label: endpoint, x: COL_X[2], y: PADDING_TOP + leafRows * ROW_HEIGHT });
      leafRows += 1;
    }
    for (const cron of group.crons_affected) {
      const key = cronKey(cron);
      if (leafNodeId.has(key)) continue;
      leafNodeId.set(key, key);
      nodes.push({ id: key, kind: "cron", label: cron, x: COL_X[2], y: PADDING_TOP + leafRows * ROW_HEIGHT });
      leafRows += 1;
    }
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const seenEdges = new Set<string>();
  const edges: GraphEdge[] = [];
  const addEdge = (fromId: string, toId: string) => {
    const edgeId = `${fromId}->${toId}`;
    if (seenEdges.has(edgeId)) return;
    seenEdges.add(edgeId);
    const from = byId.get(fromId);
    const to = byId.get(toId);
    if (!from || !to) return;
    edges.push({
      id: edgeId,
      path: bezierPath(
        from.x + GRAPH_NODE_WIDTH,
        from.y + GRAPH_NODE_HEIGHT / 2,
        to.x,
        to.y + GRAPH_NODE_HEIGHT / 2,
      ),
    });
  };

  // col1 → col2, and col2 → col3 — every caller of a symbol connects to
  // every endpoint/cron in that symbol's aggregated impact. This is an
  // approximation given we don't track a precise caller→endpoint edge.
  for (const group of groups) {
    const fromSymbol = symbolNodeId(group.symbol);
    for (const caller of group.callers) {
      const callerId = callerNodeId.get(callerKey(caller.file, caller.line))!;
      addEdge(fromSymbol, callerId);
      for (const endpoint of group.endpoints_affected) {
        addEdge(callerId, leafNodeId.get(endpointKey(endpoint))!);
      }
      for (const cron of group.crons_affected) {
        addEdge(callerId, leafNodeId.get(cronKey(cron))!);
      }
    }
  }

  const maxRows = Math.max(groups.length, callerRows, leafRows, 1);
  return {
    nodes,
    edges,
    width: COL_X[2] + GRAPH_NODE_WIDTH + PADDING_RIGHT,
    height: PADDING_TOP + maxRows * ROW_HEIGHT + PADDING_BOTTOM,
  };
}
