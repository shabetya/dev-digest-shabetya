import { describe, it, expect } from "vitest";
import { activeKeyFor } from "./helpers";

describe("activeKeyFor", () => {
  it("maps the repo tour route to the Onboarding Tour item and leaves the add-repo screen unhighlighted", () => {
    expect(activeKeyFor("/repos/abc-123/tour")).toBe("onboarding-tour");
    expect(activeKeyFor("/onboarding")).toBe("");
    expect(activeKeyFor("/repos/abc-123/pulls")).toBe("pulls");
    expect(activeKeyFor("/repos/abc-123/context")).toBe("context");
  });

  it("maps the configure-run and multi-agent-review routes to the Multi-Agent Review item", () => {
    expect(activeKeyFor("/configure-run")).toBe("multi-agent");
    expect(activeKeyFor("/multi-agent-review/run-123")).toBe("multi-agent");
  });
});
