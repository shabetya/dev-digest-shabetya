import { describe, it, expect } from 'vitest';
import type { Intent, LLMProvider, StructuredResult } from '@devdigest/shared';
import { MockLLMProvider, mockDiff } from './fixtures.js';
import { reviewPullRequest } from '../src/index.js';

/**
 * Engine-level test for reviewPullRequest (the core lifted out of the server's
 * runOneAgent). Uses local fixtures (behaviorally equivalent to server's mock
 * LLM + git, but kept inside this package — see AGENTS.md: reviewer-core must
 * not depend on server) so we exercise the real assemble → completeStructured
 * → reduce → grounding pipeline with no DB/SSE.
 */
describe('reviewPullRequest (engine)', () => {
  // One grounded finding (line 11 is in the mockDiff fixture) + one
  // hallucinated finding (line 999) the grounding gate must drop.
  const fixture = {
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
      {
        id: 'f-hallucinated',
        severity: 'WARNING',
        category: 'bug',
        title: 'phantom finding on a line not in the diff',
        file: 'src/config.ts',
        start_line: 999,
        end_line: 999,
        rationale: 'not real',
        confidence: 0.3,
        kind: 'finding',
      },
    ],
  };

  it('single-pass: assembles, grounds, drops the hallucinated finding', async () => {
    const llm = new MockLLMProvider('openai', { structured: fixture });
    const diff = mockDiff();

    const events: string[] = [];
    const outcome = await reviewPullRequest({
      systemPrompt: 'security reviewer',
      model: 'gpt-4.1',
      diff,
      llm,
      task: 'Review PR #482',
      onEvent: (e) => events.push(e.msg),
    });

    expect(outcome.mode).toBe('single-pass');
    expect(outcome.grounding).toBe('1/2 passed');
    expect(outcome.review.findings).toHaveLength(1);
    expect(outcome.review.findings[0]!.start_line).toBe(11);
    expect(outcome.dropped).toHaveLength(1);
    // Score is derived from the SURVIVING findings, not the model's self-reported
    // 38: one CRITICAL remains after grounding ⇒ 100 − 35 = 65.
    expect(outcome.review.score).toBe(65);
    // progress is surfaced (server bridges this onto SSE; runner logs it)
    expect(events.some((m) => m.includes('Citation grounding'))).toBe(true);
  });

  it('score is deterministic from findings: a clean approve scores 100', async () => {
    // Model "approves" but reports a nonsense low score (the cheap-model bug).
    // The engine must ignore that and score the zero findings as a perfect 100.
    const clean = { verdict: 'approve', summary: 'looks good', score: 10, findings: [] };
    const llm = new MockLLMProvider('openai', { structured: clean });
    const diff = mockDiff();

    const outcome = await reviewPullRequest({
      systemPrompt: 'security reviewer',
      model: 'deepseek/deepseek-v4-flash',
      diff,
      llm,
      task: 'Review PR #5',
    });

    expect(outcome.review.findings).toHaveLength(0);
    expect(outcome.review.score).toBe(100);
  });

  it('checkCancelled throwing aborts before the LLM call', async () => {
    const llm = new MockLLMProvider('openai', { structured: fixture });
    const diff = mockDiff();
    await expect(
      reviewPullRequest({
        systemPrompt: 's',
        model: 'gpt-4.1',
        diff,
        llm,
        checkCancelled: () => {
          throw new Error('cancelled');
        },
      }),
    ).rejects.toThrow('cancelled');
  });

  it('forwards sessionId to every LLM call (OpenRouter session grouping)', async () => {
    const seen: (string | undefined)[] = [];
    const recorder: LLMProvider = {
      id: 'openrouter',
      async completeStructured<T>(req): Promise<StructuredResult<T>> {
        seen.push(req.sessionId);
        return {
          data: fixture as unknown as T,
          model: req.model,
          tokensIn: 0,
          tokensOut: 0,
          costUsd: 0,
          raw: '',
          attempts: 1,
        };
      },
      async listModels() {
        return [];
      },
      async complete() {
        throw new Error('not used');
      },
      async embed() {
        return [];
      },
    };
    const diff = mockDiff();
    await reviewPullRequest({ systemPrompt: 's', model: 'm', diff, llm: recorder, sessionId: 'sess-abc' });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((s) => s === 'sess-abc')).toBe(true);
  });

  describe('Intent Layer wiring', () => {
    const intent: Intent = {
      summary: 'Adds rate limiting to public endpoints',
      in_scope: ['src/config.ts'],
      out_of_scope: ['unrelated admin panel changes'],
      confidence: 0.9,
      low_confidence: false,
      sources: ['pr_title', 'file_hunks'],
      plan_link_url: null,
      plan_link_status: 'not_linked',
    };

    it('omits the intent prompt slot and skips the scope gate when no intent is supplied', async () => {
      const llm = new MockLLMProvider('openai', { structured: fixture });
      const outcome = await reviewPullRequest({
        systemPrompt: 's',
        model: 'gpt-4.1',
        diff: mockDiff(),
        llm,
        task: 'Review PR #482',
      });
      expect(outcome.assembly.intent ?? null).toBeNull();
      expect(outcome.assembly.user).not.toContain('## PR intent & scope');
    });

    it('renders the intent slot + instruction, and a CRITICAL out-of-scope finding is collapsed, not dropped', async () => {
      const withScope = {
        verdict: 'request_changes',
        summary: 'out-of-scope critical present',
        score: 20,
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
            in_scope: false,
          },
        ],
      };
      const llm = new MockLLMProvider('openai', { structured: withScope });
      const events: string[] = [];
      const outcome = await reviewPullRequest({
        systemPrompt: 's',
        model: 'gpt-4.1',
        diff: mockDiff(),
        llm,
        task: 'Review PR #482',
        intent,
        onEvent: (e) => events.push(e.msg),
      });

      expect(outcome.assembly.intent).toContain('Adds rate limiting');
      expect(outcome.assembly.user).toContain('## PR intent & scope');
      // Grounded AND collapsed: exactly one CRITICAL finding survives, never silently dropped.
      expect(outcome.review.findings).toHaveLength(1);
      expect(outcome.review.findings[0]!.title).toMatch(/out-of-scope critical/);
      expect(events.some((m) => m.includes('Intent scope'))).toBe(true);
    });
  });
});
