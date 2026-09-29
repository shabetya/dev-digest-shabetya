import { describe, it, expect, vi } from "vitest";
import { buildShareUrl, fileUrl, formatAgo, layoutGraph, scrollWithinContainer } from "./helpers";

describe("tour helpers", () => {
  it("formats relative time, builds URLs with encoded segments, and lays out only valid edges", () => {
    const now = Date.parse("2026-01-01T12:00:00Z");
    expect(formatAgo("2026-01-01T09:00:00Z", now)).toBe("3h ago");
    expect(formatAgo("2026-01-01T11:59:40Z", now)).toBe("just now");
    expect(formatAgo("nonsense", now)).toBe("");

    expect(fileUrl("acme/app", "main", "src/my file#1.ts")).toBe(
      "https://github.com/acme/app/blob/main/src/my%20file%231.ts",
    );
    expect(buildShareUrl("http://localhost:3000", "r1", "#run-locally")).toBe(
      "http://localhost:3000/repos/r1/tour#run-locally",
    );

    const g = layoutGraph(
      [
        { id: "a", label: "Web", kind: "client" },
        { id: "b", label: "API", kind: "server" },
      ],
      [
        { from: "a", to: "b" },
        { from: "a", to: "ghost" },
      ],
    );
    expect(g.nodes).toHaveLength(2);
    expect(g.edges).toHaveLength(1);
    expect(g.nodes[1]!.x).toBeGreaterThan(g.nodes[0]!.x);
  });
});

describe("scrollWithinContainer", () => {
  it("scrolls only the nearest scrollable ancestor, never scrollIntoView", () => {
    const container = document.createElement("div");
    container.style.overflowY = "auto";
    Object.defineProperty(container, "scrollHeight", { value: 2000 });
    Object.defineProperty(container, "clientHeight", { value: 500 });
    const scrollTo = vi.fn();
    container.scrollTo = scrollTo;
    const target = document.createElement("section");
    const scrollIntoView = vi.fn();
    target.scrollIntoView = scrollIntoView;
    container.appendChild(target);
    document.body.appendChild(container);
    scrollWithinContainer(target);
    expect(scrollTo).toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
    container.remove();
  });
});
