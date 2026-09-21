import type { ConventionCandidate, ConventionStatus } from '@devdigest/shared';
import type { ConventionRow } from './repository.js';

/** Pure helper for the conventions module — DB row ⇄ DTO mapping. No I/O. */
export function toConventionDto(row: ConventionRow): ConventionCandidate {
  return {
    id: row.id,
    category: row.category,
    rule: row.rule,
    evidence_path: row.evidencePath,
    evidence_line_start: row.evidenceLineStart,
    evidence_line_end: row.evidenceLineEnd,
    evidence_snippet: row.evidenceSnippet ?? '',
    confidence: row.confidence ?? 0,
    status: row.status as ConventionStatus,
  };
}
