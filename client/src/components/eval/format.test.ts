import { describe, it, expect } from "vitest";
import { chartYRange, definedSeries, deltaTone, formatCost, formatPct, formatSigned } from "./format";

describe("eval format helpers", () => {
  it("formats metrics, deltas and cost with null-safe fallbacks", () => {
    expect(formatPct(0.834)).toBe("83%");
    expect(formatPct(null)).toBe("—");
    expect(formatSigned(2.54)).toBe("+2.5");
    expect(formatSigned(-3)).toBe("-3");
    expect(formatSigned(0.01)).toBe("0");
    expect(formatCost(null)).toBe("—");
    expect(formatCost(0.1234)).toBe("$0.12");
    expect(formatCost(0.0004)).toBe("$0.0004");
    expect(definedSeries([0.5, null, 0.7, undefined])).toEqual([0.5, 0.7]);
  });

  it("judges a change good/bad by direction, never by sign alone", () => {
    expect(deltaTone(2)).toBe("good");
    expect(deltaTone(-2)).toBe("bad");
    expect(deltaTone(0)).toBe("flat");
    expect(deltaTone(null)).toBe("flat");
    // cost: up is bad, down is good
    expect(deltaTone(0.05, "down")).toBe("bad");
    expect(deltaTone(-0.05, "down")).toBe("good");
  });

  it("keeps the 0.6–1.0 axis unless data falls below it", () => {
    expect(chartYRange([])).toEqual({ yMin: 0.6, yMax: 1 });
    expect(chartYRange([0.7, 0.9])).toEqual({ yMin: 0.6, yMax: 1 });
    expect(chartYRange([0.42, 0.9])).toEqual({ yMin: 0.4, yMax: 1 });
  });
});
