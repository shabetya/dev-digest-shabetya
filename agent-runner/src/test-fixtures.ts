import type { z } from 'zod';
import type {
  CompletionRequest,
  CompletionResult,
  LLMProvider,
  ModelInfo,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';

/**
 * Local test fixtures for `agent-runner`'s OWN test suite — mirrors
 * `reviewer-core/test/fixtures.ts`'s `MockLLMProvider` (kept local, same
 * reason: this package must not depend on `server/`, and `reviewer-core`'s
 * test fixtures aren't part of its public `src/index.ts` surface).
 */
export interface MockLLMOptions {
  structured?: unknown;
}

export class MockLLMProvider implements LLMProvider {
  readonly id: 'openai' | 'anthropic' | 'openrouter' = 'openrouter';
  public calls: { method: string; req: unknown }[] = [];

  constructor(private opts: MockLLMOptions = {}) {}

  async listModels(): Promise<ModelInfo[]> {
    return [];
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    this.calls.push({ method: 'complete', req });
    return { text: 'mock', model: req.model, tokensIn: 0, tokensOut: 0, costUsd: 0 };
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
    return texts.map(() => new Array(8).fill(0));
  }
}

/** A minimal real unified diff + its matching `pull_request` event payload. */
export const FIXTURE_DIFF_TEXT =
  'diff --git a/src/config.ts b/src/config.ts\n' +
  '--- a/src/config.ts\n' +
  '+++ b/src/config.ts\n' +
  '@@ -10,3 +10,4 @@\n' +
  '   port: 3000,\n' +
  '+  stripeKey: "sk_live_xxx",\n' +
  '   redisUrl: x,';

export function fixtureEventPayload(opts: { fork?: boolean } = {}) {
  return {
    action: 'opened',
    repository: { full_name: 'acme/payments-api' },
    pull_request: {
      number: 42,
      body: 'This PR adds a new config key.',
      head: {
        ref: 'feat/config',
        sha: 'headsha123',
        repo: { full_name: opts.fork ? 'contributor/payments-api' : 'acme/payments-api' },
      },
      base: { ref: 'main', repo: { full_name: 'acme/payments-api' } },
    },
  };
}

export const FIXTURE_REVIEW = {
  verdict: 'request_changes',
  summary: 'secret key committed',
  score: 38,
  findings: [
    {
      id: 'f1',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'sk_live in diff',
      confidence: 0.98,
      kind: 'finding',
    },
  ],
};
