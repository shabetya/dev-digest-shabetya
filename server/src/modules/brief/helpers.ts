import type { BriefMissingInput, PrBrief, SmartDiffRole, UnifiedDiff } from '@devdigest/shared';
import { sanitizePathForHeading } from '../_shared/sanitize.js';
import {
  MAX_EXPLANATION_CHARS,
  MAX_HUNK_RANGES_PER_FILE,
  MAX_KIND_CHARS,
  MAX_REASON_CHARS,
  MAX_REVIEW_FOCUS,
  MAX_RISKS,
  MAX_SUMMARY_CHARS,
  MAX_TITLE_CHARS,
} from './constants.js';
import type { BriefLlmResponse } from './types.js';

/**
 * Pure helpers for the PR brief (SPEC-03). No DB / network / LLM: everything
 * the model returns is untrusted and re-checked here BEFORE persisting
 * (AC-8 to AC-11).
 */

/** Right-side (new file) line range of one hunk, 1-based inclusive. */
export type HunkRange = readonly [start: number, end: number];

export interface BriefFileInput {
  path: string;
  additions: number;
  deletions: number;
  role: SmartDiffRole;
  ranges: readonly HunkRange[];
}

// ---- hunks -----------------------------------------------------------------

/**
 * Right-side hunk ranges per file. `[newStart, newStart + max(newLines,1) - 1]`.
 * A hunk with `newStart === 0` (deleted file: `+0,0`) has no right-side lines
 * and is skipped, so files without any range (deleted / binary / no patch)
 * are simply absent from the map.
 */
export function hunkRangesByFile(diff: UnifiedDiff): Map<string, HunkRange[]> {
  const out = new Map<string, HunkRange[]>();
  for (const f of diff.files) {
    const ranges: HunkRange[] = [];
    for (const h of f.hunks) {
      if (h.newStart <= 0) continue;
      ranges.push([h.newStart, h.newStart + Math.max(h.newLines, 1) - 1]);
    }
    if (ranges.length > 0) out.set(f.path, ranges);
  }
  return out;
}

// ---- prompt inputs ---------------------------------------------------------

const ROLE_ORDER: Record<SmartDiffRole, number> = {
  core: 0,
  wiring: 1,
  tests: 2,
  docs: 3,
  boilerplate: 4,
};

/**
 * Compact, code-free file list for the prompt: path, +/-, role and hunk line
 * ranges only. Sorted by role then churn (then path), capped at `limit` with an
 * explicit "N more files omitted" line. Paths go through `sanitizePathForHeading`
 * so a crafted filename cannot forge a delimiter.
 */
export function formatFileInputs(files: readonly BriefFileInput[], limit: number): string {
  const sorted = [...files].sort(
    (a, b) =>
      ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
      b.additions + b.deletions - (a.additions + a.deletions) ||
      a.path.localeCompare(b.path),
  );
  const shown = sorted.slice(0, limit);
  const lines = shown.map((f) => {
    const hunks =
      f.ranges.length === 0
        ? 'no hunk data'
        : f.ranges
            .slice(0, MAX_HUNK_RANGES_PER_FILE)
            .map(([s, e]) => (s === e ? `${s}` : `${s}-${e}`))
            .join(', ') + (f.ranges.length > MAX_HUNK_RANGES_PER_FILE ? ', ...' : '');
    return `- ${sanitizePathForHeading(f.path)} (+${f.additions}/-${f.deletions}, ${f.role}, hunks: ${hunks})`;
  });
  if (sorted.length > shown.length) lines.push(`(${sorted.length - shown.length} more files omitted)`);
  return lines.join('\n');
}

// ---- missing inputs --------------------------------------------------------

const MISSING_ORDER: readonly BriefMissingInput[] = ['intent', 'blast', 'specs'];

export function buildMissing(present: Record<BriefMissingInput, boolean>): BriefMissingInput[] {
  return MISSING_ORDER.filter((k) => !present[k]);
}

/** Explicit prompt line so the model does not infer inputs it was not given. */
export function describeMissingInputs(missing: readonly BriefMissingInput[]): string {
  return missing.length === 0
    ? 'Absent inputs: none.'
    : `Absent inputs: ${missing.join(', ')}. Do not guess their content.`;
}

// ---- output validation -----------------------------------------------------

/**
 * Map a model-cited path onto a real changed path: exact match first, then
 * (after trimming and dropping a leading `./` or `/`) a unique case-insensitive
 * match, also against the prompt-sanitized spelling. Ambiguous or unknown → null.
 */
export function normalizePath(raw: string, changedPaths: readonly string[]): string | null {
  const trimmed = raw.trim().replace(/^(?:\.\/|\/)+/, '');
  if (trimmed.length === 0) return null;
  if (changedPaths.includes(trimmed)) return trimmed;
  const lower = trimmed.toLowerCase();
  const hits = changedPaths.filter(
    (p) => p.toLowerCase() === lower || sanitizePathForHeading(p).toLowerCase() === lower,
  );
  return hits.length === 1 ? hits[0]! : null;
}

/** In-range lines stay; otherwise snap to the start of the nearest hunk (earlier wins ties). */
export function snapLine(line: number, ranges: readonly HunkRange[]): number | null {
  if (ranges.length === 0) return null;
  const n = Math.round(line);
  if (ranges.some(([s, e]) => n >= s && n <= e)) return n;
  let best = ranges[0]![0];
  for (const [s] of ranges) {
    if (Math.abs(s - n) < Math.abs(best - n)) best = s;
  }
  return best;
}

const oneLine = (s: string, max: number): string => s.replace(/\s+/g, ' ').trim().slice(0, max);

export interface ValidatedBrief {
  summary: string;
  risks: PrBrief['risks'];
  review_focus: PrBrief['review_focus'];
}

/**
 * AC-8..AC-10: drop non-matching `file_refs` (a risk without refs is kept),
 * drop focus items whose file is unknown / has no right-side hunk, snap lines
 * to a hunk, dedupe `file:line`, cap counts and string lengths.
 */
export function validateBrief(
  draft: BriefLlmResponse,
  changedPaths: readonly string[],
  rangesByFile: ReadonlyMap<string, readonly HunkRange[]>,
): ValidatedBrief {
  const risks: PrBrief['risks'] = [];
  for (const r of draft.risks) {
    if (risks.length >= MAX_RISKS) break;
    const title = oneLine(r.title, MAX_TITLE_CHARS);
    if (!title) continue;
    const refs = [
      ...new Set(
        r.file_refs.map((p) => normalizePath(p, changedPaths)).filter((p): p is string => p !== null),
      ),
    ];
    const explanation = (r.explanation ?? '').trim().slice(0, MAX_EXPLANATION_CHARS);
    const kind = r.kind ? oneLine(r.kind, MAX_KIND_CHARS) : '';
    risks.push({
      title,
      explanation,
      severity: r.severity,
      file_refs: refs,
      ...(kind ? { kind } : {}),
    });
  }

  const focus: PrBrief['review_focus'] = [];
  const seen = new Set<string>();
  for (const f of draft.review_focus) {
    if (focus.length >= MAX_REVIEW_FOCUS) break;
    const file = normalizePath(f.file, changedPaths);
    if (!file) continue;
    const line = Number.isFinite(f.line) ? snapLine(f.line, rangesByFile.get(file) ?? []) : null;
    if (line === null) continue;
    const key = `${file}:${line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    focus.push({ file, line, reason: oneLine(f.reason, MAX_REASON_CHARS) });
  }

  return {
    summary: draft.summary.trim().slice(0, MAX_SUMMARY_CHARS),
    risks,
    review_focus: focus,
  };
}

/** AC-11: nothing usable survived validation. */
export function isEmptyBrief(b: ValidatedBrief): boolean {
  return b.summary.length === 0 && b.risks.length === 0 && b.review_focus.length === 0;
}
