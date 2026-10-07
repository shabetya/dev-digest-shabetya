import { describe, it, expect } from "vitest";
import { blankForm, findingSkeleton, validateForm } from "./helpers";

describe("case editor validation", () => {
  const ok = { ...blankForm(), name: "leak" };

  it("accepts the Finding skeleton as a must_find case", () => {
    const v = validateForm(ok);
    expect(v.ok).toBe(true);
    expect(JSON.parse(findingSkeleton())).toHaveLength(1);
  });

  it("rejects bad JSON, an empty must_find list and a missing name — but allows [] for must_not_flag", () => {
    expect(validateForm({ ...ok, expectedText: "{" })).toMatchObject({ ok: false, reason: "expectedJson" });
    expect(validateForm({ ...ok, expectedText: "[]" })).toMatchObject({ ok: false, reason: "shape" });
    expect(validateForm({ ...ok, name: "  " })).toMatchObject({ ok: false, reason: "name" });
    expect(validateForm({ ...ok, filesText: "[oops" })).toMatchObject({ ok: false, reason: "filesJson" });
    expect(validateForm({ ...ok, expectation: "must_not_flag", expectedText: "[]" }).ok).toBe(true);
  });
});
