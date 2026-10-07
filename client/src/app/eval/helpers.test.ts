import { describe, it, expect } from "vitest";
import { orderPair, planRunAll, toggleSelection } from "./helpers";

describe("eval route helpers", () => {
  it("plans Run all: skips agents without cases and confirms above the case threshold", () => {
    const small = planRunAll([
      { agent_id: "a", agent_name: "A", cases_total: 3 },
      { agent_id: "b", agent_name: "B", cases_total: 0 },
    ]);
    expect(small).toMatchObject({ agentIds: ["a"], noCases: ["B"], totalCases: 3, needsConfirm: false });
    const big = planRunAll([
      { agent_id: "a", agent_name: "A", cases_total: 20 },
      { agent_id: "b", agent_name: "B", cases_total: 11 },
    ]);
    expect(big.needsConfirm).toBe(true);
  });

  it("orders a compare pair old → new and caps the selection at two", () => {
    const runs = [
      { id: "new", ran_at: "2026-10-02T00:00:00Z" },
      { id: "old", ran_at: "2026-10-01T00:00:00Z" },
    ];
    expect(orderPair(runs, ["new", "old"])).toEqual(["old", "new"]);
    expect(orderPair(runs, ["new"])).toBeNull();
    expect(toggleSelection(["x", "y"], "z", 2)).toEqual(["x", "y"]);
    expect(toggleSelection(["x", "y"], "x", 2)).toEqual(["y"]);
  });
});
