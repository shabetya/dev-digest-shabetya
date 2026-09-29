import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import type { DiffFocus } from "@/components/diff-viewer";

export type Crumb = { label: string; mono?: boolean; href?: string };

/** Breadcrumb trail for the PR-detail route: repo → Pull Requests → #number. */
export function buildPrDetailCrumb(repoId: string, repoName: string, number: string): Crumb[] {
  return [
    { label: repoName, mono: true, href: `/repos/${repoId}/pulls` },
    { label: "Pull Requests", href: `/repos/${repoId}/pulls` },
    { label: `#${number}`, mono: true },
  ];
}

/** Flatten every run's findings (reviews come newest-first, each run its own accordion). */
export function flattenFindings(runs: ReviewRecord[]): FindingRecord[] {
  return runs.flatMap((r) => r.findings);
}

/** Lethal-trifecta findings out of an already-flattened findings list. */
export function lethalTrifectaFindings(allFindings: FindingRecord[]): FindingRecord[] {
  return allFindings.filter((f) => f.kind === "lethal_trifecta");
}

/** Deep-link focus from `?file=&line=`. Garbage `line` is ignored (file-only focus); no `file` → null. */
export function parseDiffFocus(search: { get(name: string): string | null }): DiffFocus | null {
  const file = search.get("file");
  if (!file) return null;
  const raw = search.get("line");
  const line = raw !== null && /^\d+$/.test(raw) && Number(raw) > 0 ? Number(raw) : null;
  return { file, line };
}

/** Query string that switches to the Files tab focused on `file` (and `line`), preserving other params (e.g. `trace`). */
export function buildFileFocusQuery(current: string, file: string, line?: number | null): string {
  const sp = new URLSearchParams(current);
  sp.set("tab", "diff");
  sp.set("file", file);
  if (line != null && Number.isInteger(line) && line > 0) sp.set("line", String(line));
  else sp.delete("line");
  return sp.toString();
}
