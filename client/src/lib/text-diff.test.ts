import { describe, it, expect } from "vitest";
import { diffLines } from "./text-diff";

describe("diffLines", () => {
  it("marks identical text as entirely unchanged", () => {
    expect(diffLines("a\nb\nc", "a\nb\nc")).toEqual([
      { kind: "same", text: "a" },
      { kind: "same", text: "b" },
      { kind: "same", text: "c" },
    ]);
  });

  it("marks a changed line as a del followed by an add, keeping shared context", () => {
    expect(diffLines("title\nold line\nfooter", "title\nnew line\nfooter")).toEqual([
      { kind: "same", text: "title" },
      { kind: "del", text: "old line" },
      { kind: "add", text: "new line" },
      { kind: "same", text: "footer" },
    ]);
  });

  it("handles a pure insertion", () => {
    expect(diffLines("a\nc", "a\nb\nc")).toEqual([
      { kind: "same", text: "a" },
      { kind: "add", text: "b" },
      { kind: "same", text: "c" },
    ]);
  });

  it("handles a pure deletion", () => {
    expect(diffLines("a\nb\nc", "a\nc")).toEqual([
      { kind: "same", text: "a" },
      { kind: "del", text: "b" },
      { kind: "same", text: "c" },
    ]);
  });
});
