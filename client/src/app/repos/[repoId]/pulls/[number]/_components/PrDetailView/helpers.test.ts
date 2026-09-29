import { describe, it, expect } from "vitest";
import { buildFileFocusQuery, parseDiffFocus } from "./helpers";

describe("buildFileFocusQuery", () => {
  it("switches to the diff tab, encodes awkward paths, preserves other params and round-trips", () => {
    const qs = buildFileFocusQuery("tab=overview&trace=run-1", "src/a b&c/é.ts", 12);
    const sp = new URLSearchParams(qs);
    expect(sp.get("tab")).toBe("diff");
    expect(sp.get("trace")).toBe("run-1");
    expect(sp.get("file")).toBe("src/a b&c/é.ts");
    expect(sp.get("line")).toBe("12");
    expect(qs).not.toContain(" ");
    expect(parseDiffFocus(sp)).toEqual({ file: "src/a b&c/é.ts", line: 12 });
  });

  it("omits or clears line when it is missing or invalid, and parse ignores garbage", () => {
    expect(new URLSearchParams(buildFileFocusQuery("line=9", "a.ts")).has("line")).toBe(false);
    expect(new URLSearchParams(buildFileFocusQuery("", "a.ts", 0)).has("line")).toBe(false);
    expect(new URLSearchParams(buildFileFocusQuery("", "a.ts", 1.5)).has("line")).toBe(false);
    expect(parseDiffFocus(new URLSearchParams("file=a.ts&line=abc"))).toEqual({ file: "a.ts", line: null });
    expect(parseDiffFocus(new URLSearchParams("file=a.ts&line=-3"))).toEqual({ file: "a.ts", line: null });
    expect(parseDiffFocus(new URLSearchParams("line=3"))).toBeNull();
  });
});
