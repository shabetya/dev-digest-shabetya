import type { SpecFile } from "@devdigest/shared";

/** Group docs by top-level folder, groups and files sorted by name. */
export function groupFiles(files: readonly SpecFile[]): { group: string; files: SpecFile[] }[] {
  const map = new Map<string, SpecFile[]>();
  for (const f of files) map.set(f.group, [...(map.get(f.group) ?? []), f]);
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, list]) => ({ group, files: list.sort((a, b) => a.path.localeCompare(b.path)) }));
}

export function sumTokens(paths: readonly string[], files: readonly SpecFile[]): number {
  const byPath = new Map(files.map((f) => [f.path, f.tokens]));
  return paths.reduce((n, p) => n + (byPath.get(p) ?? 0), 0);
}
