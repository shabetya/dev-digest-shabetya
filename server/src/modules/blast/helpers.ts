import type {
  BlastCaller,
  BlastRadiusResponse,
  ChangedSymbol,
  DownstreamImpact,
  PriorPr,
} from '@devdigest/shared';
import type { BlastCallerRow, BlastResult } from '../repo-intel/types.js';

/**
 * Blast Radius — pure mapping from the repo-intel facade's `BlastResult` to
 * the wire contract (`BlastRadiusResponse`). No LLM call, no DB access: this
 * is read-only presentation over data `getBlastRadius` already computed.
 */

/**
 * Union endpoints/crons across a set of caller files, via `factsByFile`.
 * `factsByFile` is absent on the degraded/ripgrep-only path — treat that as
 * "no facts available" rather than throwing.
 */
function endpointsAndCronsForFiles(
  files: string[],
  factsByFile: BlastResult['factsByFile'],
): { endpoints: string[]; crons: string[] } {
  if (!factsByFile) return { endpoints: [], crons: [] };
  const endpoints = new Set<string>();
  const crons = new Set<string>();
  for (const file of files) {
    const facts = factsByFile[file];
    if (!facts) continue;
    for (const e of facts.endpoints) endpoints.add(e);
    for (const c of facts.crons) crons.add(c);
  }
  return { endpoints: [...endpoints].sort(), crons: [...crons].sort() };
}

const TAKEAWAY_MAX_CHARS = 120;

// Best-effort filter for a stored review `summary` that's actually an LLM
// refusal/error ("I can't perform this review because…") rather than a real
// verdict — these happen when an earlier review run was itself degraded, and
// showing them verbatim in the Prior PRs panel reads as a Blast Radius bug
// even though the bad data predates this feature. Not exhaustive — just the
// common lead-ins, so it degrades to "no takeaway" rather than misleading.
const REFUSAL_LEAD_INS = [/^i can'?t\b/i, /^i cannot\b/i, /^i'?m unable\b/i, /^i am unable\b/i];

/**
 * `reviews.summary` is the whole PR's final review verdict, not a note about
 * why that PR is relevant to *these* files — we don't have anything more
 * targeted without a fresh LLM call, which Blast Radius deliberately never
 * makes. This only trims it to something skimmable (first sentence, capped
 * length) and drops it entirely when it looks like a stored review failure.
 */
function sanitizeTakeaway(summary: string | null): string | null {
  if (!summary) return null;
  const trimmed = summary.trim();
  if (!trimmed) return null;
  if (REFUSAL_LEAD_INS.some((re) => re.test(trimmed))) return null;

  const sentenceEnd = trimmed.search(/[.!?](\s|$)/);
  const firstSentence = sentenceEnd === -1 ? trimmed : trimmed.slice(0, sentenceEnd + 1);
  if (firstSentence.length <= TAKEAWAY_MAX_CHARS) return firstSentence;
  return `${firstSentence.slice(0, TAKEAWAY_MAX_CHARS - 1).trimEnd()}…`;
}

export function mapBlastResult(result: BlastResult, priorPrs: PriorPr[]): BlastRadiusResponse {
  const changed_symbols: ChangedSymbol[] = result.changedSymbols.map((s) => ({
    name: s.name,
    file: s.file,
    kind: s.kind,
  }));

  // Group callers by the changed symbol they reach (viaSymbol).
  const callersBySymbol = new Map<string, BlastCallerRow[]>();
  for (const caller of result.callers) {
    const list = callersBySymbol.get(caller.viaSymbol) ?? [];
    list.push(caller);
    callersBySymbol.set(caller.viaSymbol, list);
  }

  // One downstream entry per changed symbol — INCLUDING those with zero
  // callers (`callers: []`), so the "no downstream callers" UI state has
  // real data to render rather than needing to infer absence.
  const downstream: DownstreamImpact[] = changed_symbols.map((symbol) => {
    const callerRows = callersBySymbol.get(symbol.name) ?? [];
    const callers: BlastCaller[] = callerRows.map((row) => ({
      name: row.symbol,
      file: row.file,
      line: row.line,
    }));
    const { endpoints, crons } = endpointsAndCronsForFiles(
      callerRows.map((row) => row.file),
      result.factsByFile,
    );
    return {
      symbol: symbol.name,
      callers,
      endpoints_affected: endpoints,
      crons_affected: crons,
    };
  });

  // Global (deduped) endpoint/cron counts for the summary line only — a
  // symbol-level group's own endpoints_affected/crons_affected stay
  // per-group above.
  const allEndpoints = new Set<string>();
  const allCrons = new Set<string>();
  for (const group of downstream) {
    for (const e of group.endpoints_affected) allEndpoints.add(e);
    for (const c of group.crons_affected) allCrons.add(c);
  }

  // Plain counts, no LLM call.
  const summary = `${changed_symbols.length} changed symbol(s), ${result.callers.length} caller(s), ${allEndpoints.size} endpoint(s)/${allCrons.size} cron(s) affected.`;

  return {
    changed_symbols,
    downstream,
    summary,
    degraded: !!result.degraded,
    degraded_reason: result.reason ?? null,
    prior_prs: priorPrs.map((pr) => ({ ...pr, takeaway: sanitizeTakeaway(pr.takeaway) })),
  };
}
