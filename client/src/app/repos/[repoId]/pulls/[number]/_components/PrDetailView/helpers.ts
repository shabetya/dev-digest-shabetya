import type { FindingRecord, ReviewRecord } from "@devdigest/shared";

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
