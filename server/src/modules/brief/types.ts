import { z } from 'zod';
import { RiskSeverity } from '@devdigest/shared';

/**
 * Schema handed to `completeStructured`. Lenient about list sizes and optional
 * prose (helpers.ts clamps/drops), strict on shape. Everything here is
 * untrusted until `validateBrief` has run.
 */
export const BriefLlmResponse = z.object({
  summary: z.string(),
  risks: z.array(
    z.object({
      title: z.string(),
      explanation: z.string().nullish(),
      severity: RiskSeverity,
      kind: z.string().nullish(),
      file_refs: z.array(z.string()),
    }),
  ),
  review_focus: z.array(z.object({ file: z.string(), line: z.number(), reason: z.string() })),
});
export type BriefLlmResponse = z.infer<typeof BriefLlmResponse>;

/** Logging surface the brief service/repository need (a Fastify logger satisfies it). */
export interface BriefLogger {
  warn(obj: object, msg: string): void;
  info(obj: object, msg: string): void;
}
