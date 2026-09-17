import type { z } from 'zod';
import type {
  CompletionRequest,
  CompletionResult,
  LLMProvider,
  ModelInfo,
  StructuredRequest,
  StructuredResult,
  UnifiedDiff,
} from '@devdigest/shared';

/**
 * Local test fixtures for reviewer-core's OWN test suite.
 *
 * This package must not depend on `server/` (see AGENTS.md: "No DB, GitHub,
 * or filesystem — consumed BY server, not depending on it"). These mocks are
 * behaviorally equivalent, for what `run.test.ts` exercises, to server's
 * `MockLLMProvider` / `MockGitClient` (server/src/adapters/mocks.ts) — just
 * kept local so reviewer-core's tests never resolve `../../server/src/**`.
 */

// ---------- Mock LLM ----------
export interface MockLLMOptions {
  models?: ModelInfo[];
  /** Fixture returned by completeStructured (validated against the schema). */
  structured?: unknown;
  completionText?: string;
  embedding?: number[];
}

export class MockLLMProvider implements LLMProvider {
  readonly id: 'openai' | 'anthropic';
  public calls: { method: string; req: unknown }[] = [];

  constructor(
    id: 'openai' | 'anthropic' = 'openai',
    private opts: MockLLMOptions = {},
  ) {
    this.id = id;
  }

  async listModels(): Promise<ModelInfo[]> {
    this.calls.push({ method: 'listModels', req: null });
    return (
      this.opts.models ?? [
        { id: 'gpt-4.1', provider: this.id === 'anthropic' ? 'anthropic' : 'openai' },
      ]
    );
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    this.calls.push({ method: 'complete', req });
    return {
      text: this.opts.completionText ?? 'mock completion',
      model: req.model,
      tokensIn: 100,
      tokensOut: 50,
      costUsd: 0.001,
    };
  }

  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push({ method: 'completeStructured', req });
    const fixture = this.opts.structured ?? {};
    const parsed = (req.schema as z.ZodType<T>).safeParse(fixture);
    if (!parsed.success) {
      throw new Error(`MockLLMProvider fixture failed schema: ${parsed.error.message}`);
    }
    return {
      data: parsed.data,
      model: req.model,
      tokensIn: 100,
      tokensOut: 50,
      costUsd: 0.001,
      raw: JSON.stringify(fixture),
      attempts: 1,
    };
  }

  async embed(texts: string[]): Promise<number[][]> {
    this.calls.push({ method: 'embed', req: texts });
    return texts.map(() => this.opts.embedding ?? new Array(1536).fill(0));
  }
}

/**
 * Fixed diff fixture equivalent to server's `MockGitClient` default diff —
 * built directly as a `UnifiedDiff` (reviewer-core has no diff parser of its
 * own, and doesn't need one just for this fixture). One file, one hunk
 * covering new-side lines 10-13, matching the added `stripeKey` line (11)
 * that `run.test.ts`'s fixture finding cites; line 999 (the "hallucinated"
 * finding) is deliberately outside every hunk so the grounding gate drops it.
 */
export function mockDiff(): UnifiedDiff {
  return {
    raw:
      'diff --git a/src/config.ts b/src/config.ts\n' +
      '--- a/src/config.ts\n' +
      '+++ b/src/config.ts\n' +
      '@@ -10,3 +10,4 @@\n' +
      '   port: 3000,\n' +
      '+  stripeKey: "sk_live_xxx",\n' +
      '   redisUrl: x,',
    files: [
      {
        path: 'src/config.ts',
        additions: 1,
        deletions: 0,
        hunks: [
          {
            file: 'src/config.ts',
            oldStart: 10,
            oldLines: 3,
            newStart: 10,
            newLines: 4,
            newLineNumbers: [10, 11, 12, 13],
          },
        ],
      },
    ],
  };
}
