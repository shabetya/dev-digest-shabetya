import type { CiFile } from "@devdigest/shared";

/** AC-5 defaults: opened + synchronize checked, reopened present but unchecked. */
export const DEFAULT_TRIGGERS = ["opened", "synchronize"];
export const ALL_TRIGGER_TYPES = ["opened", "synchronize", "reopened"] as const;

export const WORKFLOW_FILE_PATH = ".github/workflows/devdigest-review.yml";

export function toggleTrigger(current: string[], type: string, checked: boolean): string[] {
  if (checked) return current.includes(type) ? current : [...current, type];
  return current.filter((t) => t !== type);
}

export function workflowFile(files: CiFile[] | undefined): CiFile | undefined {
  return files?.find((f) => f.path === WORKFLOW_FILE_PATH);
}

/**
 * Fix A (AC-2): the zip built client-side must reflect the SAME content the
 * user would get from Install-via-PR — i.e. the Preview step's hand-edited
 * workflow YAML, not the server's last-generated default. Swaps in
 * `workflowEdit` for the workflow file's contents when it's a non-empty
 * string (mirrors the server's own non-empty check in `templates.ts`);
 * otherwise returns `files` unchanged.
 */
export function withWorkflowEdit(files: CiFile[] | undefined, workflowEdit: string): CiFile[] {
  if (!files) return [];
  if (workflowEdit.trim().length === 0) return files;
  return files.map((f) => (f.path === WORKFLOW_FILE_PATH ? { ...f, contents: workflowEdit } : f));
}
