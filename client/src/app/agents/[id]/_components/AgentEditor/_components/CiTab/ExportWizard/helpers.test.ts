import { describe, it, expect } from "vitest";
import type { CiFile } from "@devdigest/shared";
import { WORKFLOW_FILE_PATH, withWorkflowEdit } from "./helpers";

const FILES: CiFile[] = [
  { path: ".devdigest/agents/security-reviewer.yaml", contents: "name: Security Reviewer\n", editable: true },
  { path: WORKFLOW_FILE_PATH, contents: "name: DevDigest Review\n", editable: true },
];

describe("withWorkflowEdit (Fix A / AC-2)", () => {
  it("swaps the workflow file's contents for the Preview edit so the zip matches what Install-via-PR would produce", () => {
    const edited = "name: Edited Workflow\n";
    const result = withWorkflowEdit(FILES, edited);

    expect(result.find((f) => f.path === WORKFLOW_FILE_PATH)?.contents).toBe(edited);
    // Non-workflow files are untouched.
    expect(result.find((f) => f.path !== WORKFLOW_FILE_PATH)?.contents).toBe("name: Security Reviewer\n");
  });

  it("falls back to the generated contents when the edit is empty/whitespace-only, and tolerates an undefined file list", () => {
    expect(withWorkflowEdit(FILES, "   ").find((f) => f.path === WORKFLOW_FILE_PATH)?.contents).toBe(
      "name: DevDigest Review\n",
    );
    expect(withWorkflowEdit(undefined, "name: Edited\n")).toEqual([]);
  });
});
