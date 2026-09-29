import { z } from 'zod';
import { OnboardingNodeKind } from '@devdigest/shared';

/**
 * Schema handed to `completeStructured`. Deliberately lenient about list sizes
 * (the sanitizers in helpers.ts clamp/drop) but strict on shape: an unknown
 * diagram `kind` or a missing section is a generation failure (edge case in
 * SPEC-02). Field names mirror the persisted `Onboarding.sections` keys.
 */
export const OnboardingLlmResponse = z.object({
  architecture: z.object({
    prose: z.string(),
    nodes: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        kind: OnboardingNodeKind,
        file: z.string().nullish(),
      }),
    ),
    edges: z.array(
      z.object({
        from: z.string(),
        to: z.string(),
        label: z.string().nullish(),
      }),
    ),
  }),
  critical_paths: z.array(z.object({ path: z.string(), description: z.string() })),
  run_locally: z.array(z.object({ command: z.string(), comment: z.string().nullish() })),
  reading_path: z.array(z.object({ path: z.string(), reason: z.string() })),
  first_tasks: z.array(
    z.object({ title: z.string(), description: z.string(), files: z.array(z.string()) }),
  ),
});
export type OnboardingLlmResponse = z.infer<typeof OnboardingLlmResponse>;
