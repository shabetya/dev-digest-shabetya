import { z } from 'zod';

/**
 * Review / Findings contracts.
 * These Zod schemas are the single source of truth for:
 *  - API request/response validation,
 *  - LLM structured output (`response_format` / forced tool-use),
 *  - shared web↔api types.
 */

export const Severity = z.enum(['CRITICAL', 'WARNING', 'SUGGESTION']);
export type Severity = z.infer<typeof Severity>;

export const FindingCategory = z.enum(['bug', 'security', 'perf', 'style', 'test']);
export type FindingCategory = z.infer<typeof FindingCategory>;

export const FindingKind = z.enum([
  'finding',
  'secret_leak',
  'lethal_trifecta',
  'phantom',
  'hook',
]);
export type FindingKind = z.infer<typeof FindingKind>;

export const Verdict = z.enum(['request_changes', 'approve', 'comment']);
export type Verdict = z.infer<typeof Verdict>;

export const TrifectaComponent = z.enum([
  'private_data_access',
  'untrusted_input',
  'exfil_path',
]);
export type TrifectaComponent = z.infer<typeof TrifectaComponent>;

export const TrifectaEvidence = z.object({
  component: TrifectaComponent,
  file: z.string(),
  line: z.number().int(),
});
export type TrifectaEvidence = z.infer<typeof TrifectaEvidence>;

/**
 * The lethal-trifecta invariant, factored out so it can be applied both to
 * `Finding` (below) and to `FindingRecord` (review-api.ts, which extends
 * `FindingShape` with persisted-row fields and needs the same invariant).
 */
export function checkTrifectaInvariant(
  f: {
    kind?: FindingKind | null;
    trifecta_components?: TrifectaComponent[] | null;
    evidence?: TrifectaEvidence[] | null;
  },
  ctx: z.RefinementCtx,
): void {
  const isTrifecta = f.kind === 'lethal_trifecta';
  if (isTrifecta && (!f.trifecta_components?.length || !f.evidence?.length)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'lethal_trifecta findings require non-empty trifecta_components and evidence',
      path: ['trifecta_components'],
    });
  }
  if (!isTrifecta && (f.trifecta_components != null || f.evidence != null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "trifecta_components/evidence are only valid when kind is 'lethal_trifecta'",
      path: ['kind'],
    });
  }
}

/**
 * Finding — the atomic review unit. `start_line`/`end_line` are used by the
 * citation-grounding gate (must intersect a real diff hunk for diff-findings).
 *
 * `FindingShape` is the plain object schema (kept exported so `FindingRecord`
 * in review-api.ts can still `.extend()` it — `.superRefine()` returns a
 * `ZodEffects` wrapper, which has no `.extend()`). `Finding` itself is the
 * refined schema and is what everything else should import.
 */
export const FindingShape = z.object({
  id: z.string(),
  severity: Severity,
  category: FindingCategory,
  title: z.string(),
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  rationale: z.string(), // markdown
  suggestion: z.string().nullish(), // markdown
  confidence: z.number().min(0).max(1),
  kind: FindingKind.nullish(),
  // Lethal-trifecta variant fields (present only when kind === 'lethal_trifecta')
  trifecta_components: z.array(TrifectaComponent).nullish(),
  evidence: z.array(TrifectaEvidence).nullish(),
});

// Enforces the lethal-trifecta invariant without reshaping the schema into a
// discriminated union — this object shape is also used to generate the LLM
// structured-output contract (response_format / forced tool-use), and a
// discriminated union would change the JSON-schema sent to real providers.
export const Finding = FindingShape.superRefine(checkTrifectaInvariant);
export type Finding = z.infer<typeof Finding>;

/** Review — the consolidated structured output of a single agent run. */
export const Review = z.object({
  verdict: Verdict,
  summary: z.string(),
  score: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe(
      'Overall PR quality from 0 to 100, where HIGHER is better. 90–100 = no or only trivial issues (approve); 60–89 = minor suggestions; 30–59 = warnings worth addressing; 0–29 = critical problems. Must be consistent with `findings`: if there are no findings, the score is 90 or above.',
    ),
  findings: z.array(Finding),
});
export type Review = z.infer<typeof Review>;

/** Action taken on a finding (accept/dismiss/learn/reply). */
export const FindingActionKind = z.enum(['accept', 'dismiss', 'learn', 'reply']);
export type FindingActionKind = z.infer<typeof FindingActionKind>;

export const FindingAction = z.object({
  action: FindingActionKind,
  reply: z.string().optional(),
});
export type FindingAction = z.infer<typeof FindingAction>;
