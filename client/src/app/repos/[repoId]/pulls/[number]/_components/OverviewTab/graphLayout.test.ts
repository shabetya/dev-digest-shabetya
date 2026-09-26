import { describe, it, expect } from "vitest";
import type { DownstreamImpact } from "@devdigest/shared";
import { computeGraphLayout } from "./graphLayout";

describe("computeGraphLayout", () => {
  it("filters out zero-caller symbols, dedupes callers by file:line, and labels caller nodes by function name", () => {
    const downstream: DownstreamImpact[] = [
      {
        symbol: "chargeCard",
        callers: [
          { name: "handlePayment", file: "src/routes/payments.ts", line: 10 },
          { name: "retryFailedCharges", file: "src/jobs/retryJob.ts", line: 22 },
        ],
        endpoints_affected: ["POST /payments"],
        crons_affected: ["retry-failed-charges"],
      },
      {
        symbol: "refundCard",
        callers: [{ name: "handlePayment", file: "src/routes/payments.ts", line: 10 }],
        endpoints_affected: ["POST /payments"],
        crons_affected: [],
      },
      // Zero callers — must contribute no node and no edge.
      { symbol: "unusedHelper", callers: [], endpoints_affected: [], crons_affected: [] },
    ];

    const layout = computeGraphLayout(downstream);

    const symbolNodes = layout.nodes.filter((n) => n.kind === "symbol");
    expect(symbolNodes.map((n) => n.label)).toEqual(["chargeCard", "refundCard"]);
    expect(symbolNodes.every((n) => n.label !== "unusedHelper")).toBe(true);

    // Same caller (file:line) reached by two symbols → one node, labeled by
    // its function name rather than its file path.
    const callerNodes = layout.nodes.filter((n) => n.kind === "caller");
    expect(callerNodes).toHaveLength(2);
    expect(callerNodes.map((n) => n.label)).toEqual(["handlePayment", "retryFailedCharges"]);

    const leafNodes = layout.nodes.filter((n) => n.kind === "endpoint" || n.kind === "cron");
    expect(leafNodes.map((n) => ({ kind: n.kind, label: n.label }))).toEqual([
      { kind: "endpoint", label: "POST /payments" },
      { kind: "cron", label: "retry-failed-charges" },
    ]);

    // Distinct y positions for the two stacked symbol nodes.
    expect(symbolNodes[0]!.y).not.toBe(symbolNodes[1]!.y);

    // Edges connect col1 → col2 → col3; every path is a non-empty string.
    expect(layout.edges.length).toBeGreaterThan(0);
    for (const edge of layout.edges) {
      expect(edge.path).toMatch(/^M /);
    }
  });

  it("returns no nodes/edges when every symbol has zero callers", () => {
    const downstream: DownstreamImpact[] = [
      { symbol: "unusedHelper", callers: [], endpoints_affected: [], crons_affected: [] },
    ];
    const layout = computeGraphLayout(downstream);
    expect(layout.nodes).toEqual([]);
    expect(layout.edges).toEqual([]);
  });
});
