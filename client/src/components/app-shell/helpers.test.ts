import { describe, it, expect } from "vitest";
import { activeKeyFor } from "./helpers";

describe("activeKeyFor", () => {
  it("maps the repo tour route to the Onboarding Tour item and leaves the add-repo screen unhighlighted", () => {
    expect(activeKeyFor("/repos/abc-123/tour")).toBe("onboarding-tour");
    expect(activeKeyFor("/onboarding")).toBe("");
    expect(activeKeyFor("/repos/abc-123/pulls")).toBe("pulls");
    expect(activeKeyFor("/repos/abc-123/context")).toBe("context");
  });
});
