import { z } from 'zod';

/**
 * Shape the LLM must return for one candidate — everything BUT the
 * server-assigned `id` and `status` from `ConventionCandidate`
 * (`@devdigest/shared`). Enforced out-of-band via `completeStructured`'s
 * `response_format`, same convention as reviewer-core's `Review` schema.
 */
export const ConventionCandidateInput = z.object({
  category: z.string().min(1).max(60),
  rule: z.string().min(1),
  evidence_path: z.string().min(1),
  evidence_line_start: z.number().int().positive(),
  evidence_line_end: z.number().int().positive(),
  evidence_snippet: z.string(),
  confidence: z.number().min(0).max(1),
});
export type ConventionCandidateInput = z.infer<typeof ConventionCandidateInput>;

export const ConventionExtractionResponse = z.object({
  candidates: z.array(ConventionCandidateInput),
});
export type ConventionExtractionResponse = z.infer<typeof ConventionExtractionResponse>;
