import { describe, it, expect } from "vitest";
import { effectivePaths, inheritedOnly, moveItem } from "./context-paths";

describe("context-paths", () => {
  it("orders own first, then skills, deduped; inherited excludes own", () => {
    expect(effectivePaths(["a.md", "b.md"], [["c.md", "a.md"], ["d.md", "c.md"]])).toEqual([
      "a.md",
      "b.md",
      "c.md",
      "d.md",
    ]);
    expect(inheritedOnly(["a.md"], [["c.md", "a.md"], ["d.md"]])).toEqual(["c.md", "d.md"]);
  });
  it("moveItem reorders and ignores out-of-range", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b"], 0, -1)).toEqual(["a", "b"]);
  });
});
