/* context-paths — pure helpers for project-context attachment lists. */

/** Dedupe preserving first-seen order. */
export function dedupePaths(paths: readonly string[]): string[] {
  return [...new Set(paths)];
}

/** Effective (injected) list order: the agent's own docs, then each enabled
    linked skill's docs in link order, deduplicated by path. */
export function effectivePaths(own: readonly string[], linkedSkillPaths: readonly (readonly string[])[]): string[] {
  return dedupePaths([...own, ...linkedSkillPaths.flat()]);
}

/** Paths reachable only through linked skills (not in the agent's own list). */
export function inheritedOnly(own: readonly string[], linkedSkillPaths: readonly (readonly string[])[]): string[] {
  const ownSet = new Set(own);
  return effectivePaths([], linkedSkillPaths).filter((p) => !ownSet.has(p));
}

/** Move the item at `from` to index `to`; returns a new array (no-op if out of range). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from < 0 || from >= next.length || to < 0 || to >= next.length || from === to) return next;
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}
