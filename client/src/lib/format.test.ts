import { describe, it, expect } from "vitest";
import { formatCost } from "./format";

describe("formatCost", () => {
  it("renders '—' for null/undefined, never '$0.00'", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
  });

  it("uses 4 decimals for sub-cent values so tiny costs aren't rounded to zero", () => {
    expect(formatCost(0.0013)).toBe("$0.0013");
  });

  it("uses 3 decimals for values at or above a cent", () => {
    expect(formatCost(0.014)).toBe("$0.014");
    expect(formatCost(0.06)).toBe("$0.060");
  });

  it("renders an exact zero cost as a real value, distinct from unknown ('—')", () => {
    expect(formatCost(0)).toBe("$0.0000");
  });
});
