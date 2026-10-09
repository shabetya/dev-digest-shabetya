import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type {
  ChatMessage,
  CompletionRequest,
  CompletionResult,
  LLMProvider,
  ModelInfo,
  Review,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import * as t from '../../src/db/schema.js';
import type { PgFixture } from './pg.js';

/** A two-file PR diff: src/a.ts (lines 10-13, +line 11) and src/other.ts. */
export const DIFF_AB = [
  'diff --git a/src/a.ts b/src/a.ts',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -10,3 +10,4 @@',
  '   port: 3000,',
  '+  stripeKey: "sk_live_xxx",',
  '   redisUrl: x,',
  '   other: y,',
  'diff --git a/src/other.ts b/src/other.ts',
  '--- a/src/other.ts',
  '+++ b/src/other.ts',
  '@@ -1,1 +1,2 @@',
  ' keep',
  '+added-in-other',
].join('\n');

/** Single-file halves of DIFF_AB (what a case frozen from one finding holds). */
export const DIFF_A = DIFF_AB.split('diff --git a/src/other.ts')[0]!.trimEnd();
export const DIFF_OTHER = 'diff --git a/src/other.ts' + DIFF_AB.split('diff --git a/src/other.ts')[1]!;

export interface FindingSpec {
  file: string;
  start: number;
  end?: number;
  title?: string;
}

/** A Review fixture with the given findings (schema-valid). */
export function reviewOf(specs: FindingSpec[]): Review {
  return {
    verdict: specs.length ? 'request_changes' : 'approve',
    summary: 'fixture',
    score: specs.length ? 50 : 95,
    findings: specs.map((s, i) => ({
      id: `fx-${i}`,
      severity: 'WARNING' as const,
      category: 'bug' as const,
      title: s.title ?? `Finding ${i}`,
      file: s.file,
      start_line: s.start,
      end_line: s.end ?? s.start,
      rationale: 'because',
      confidence: 0.9,
      kind: 'finding' as const,
    })),
  };
}

export type Script = (req: StructuredRequest<unknown>) => Review | Promise<Review>;

/**
 * Scripted LLM: `script` sees every structured request (messages included) and
 * returns the Review fixture — or throws to simulate a provider error. Records
 * all requests for prompt-content assertions.
 */
export class ScriptedLLM implements LLMProvider {
  readonly id = 'openai' as const;
  readonly requests: StructuredRequest<unknown>[] = [];
  constructor(private script: Script) {}
  async listModels(): Promise<ModelInfo[]> {
    return [];
  }
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    return { text: '', model: req.model, tokensIn: 0, tokensOut: 0, costUsd: null };
  }
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(() => []);
  }
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.requests.push(req as StructuredRequest<unknown>);
    const fixture = await this.script(req as StructuredRequest<unknown>);
    const data = (req.schema as { parse(v: unknown): T }).parse(fixture);
    return { data, model: req.model, tokensIn: 10, tokensOut: 5, costUsd: 0.001, raw: JSON.stringify(fixture), attempts: 1 };
  }
}

export const allText = (messages: ChatMessage[]): string =>
  messages.map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n');

export const systemText = (messages: ChatMessage[]): string =>
  allText(messages.filter((m) => m.role === 'system'));

/** The file a request's diff section is about (single-file case diffs). */
export const diffFileOf = (req: StructuredRequest<unknown>): string => {
  const m = allText(req.messages).match(/diff --git a\/(\S+) b\//);
  return m?.[1] ?? '';
};

export async function defaultWorkspaceId(db: PgFixture['handle']['db']): Promise<string> {
  const [ws] = await db.select().from(t.workspaces);
  return ws!.id;
}

let seq = 0;

/** Create an agent through the API (so version 1 + snapshot exist). */
export async function createAgent(
  app: FastifyInstance,
  over: Record<string, unknown> = {},
): Promise<{ id: string; version: number; name: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/agents',
    payload: {
      name: `Eval Agent ${seq++}`,
      provider: 'openai',
      model: 'gpt-4o-mini',
      system_prompt: 'You are a careful reviewer.',
      strategy: 'single-pass',
      ...over,
    },
  });
  if (res.statusCode >= 300) throw new Error(`createAgent failed: ${res.body}`);
  return res.json();
}

/** Insert repo + PR (+ pr_files) + review by `agentId` + one finding; returns ids. */
export async function seedFinding(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  opts: {
    agentId: string | null;
    decision?: 'accepted' | 'dismissed' | null;
    file?: string;
    start?: number;
    end?: number;
    title?: string;
    prBody?: string | null;
  },
) {
  const name = `eval-repo-${seq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 7,
      title: 'Add stripe config',
      author: 'dev',
      branch: 'feat/x',
      base: 'main',
      headSha: 'abc123',
      status: 'needs_review',
      body: opts.prBody === undefined ? 'Adds the stripe key config.' : opts.prBody,
    })
    .returning();
  const [review] = await db
    .insert(t.reviews)
    .values({ workspaceId, prId: pr!.id, agentId: opts.agentId, kind: 'review', verdict: 'comment', summary: 's', score: 50, model: 'gpt-4o-mini' })
    .returning();
  const [finding] = await db
    .insert(t.findings)
    .values({
      reviewId: review!.id,
      file: opts.file ?? 'src/a.ts',
      startLine: opts.start ?? 11,
      endLine: opts.end ?? opts.start ?? 11,
      severity: 'WARNING',
      category: 'bug',
      title: opts.title ?? 'Hardcoded Stripe key',
      rationale: 'r',
      confidence: 0.9,
      acceptedAt: opts.decision === 'accepted' ? new Date() : null,
      dismissedAt: opts.decision === 'dismissed' ? new Date() : null,
    })
    .returning();
  return { repo: repo!, pr: pr!, review: review!, finding: finding! };
}

/** Poll a suite run until it leaves `running`. */
export async function waitForSuite(app: FastifyInstance, runId: string, timeoutMs = 15_000) {
  const start = Date.now();
  for (;;) {
    const res = await app.inject({ method: 'GET', url: `/eval-suite-runs/${runId}` });
    const body = res.json();
    if (body.status && body.status !== 'running') return body;
    if (Date.now() - start > timeoutMs) throw new Error(`suite ${runId} still running after ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

/** POST a suite run and wait for it to finish. */
export async function runSuite(app: FastifyInstance, agentId: string) {
  const res = await app.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` });
  if (res.statusCode !== 202) throw new Error(`startSuite → ${res.statusCode} ${res.body}`);
  return waitForSuite(app, res.json().id);
}

export async function addCase(
  app: FastifyInstance,
  agentId: string,
  body: { name: string; expectation: 'must_find' | 'must_not_flag'; expected_output: unknown[]; input_diff?: string; input_meta?: unknown },
) {
  const res = await app.inject({
    method: 'POST',
    url: `/agents/${agentId}/eval-cases`,
    payload: { input_diff: DIFF_AB, ...body },
  });
  if (res.statusCode !== 201) throw new Error(`addCase → ${res.statusCode} ${res.body}`);
  return res.json() as { id: string; name: string };
}

export async function evalRowCounts(db: PgFixture['handle']['db']) {
  const [reviews, runs, suites, caseRuns] = await Promise.all([
    db.select().from(t.reviews),
    db.select().from(t.agentRuns),
    db.select().from(t.evalSuiteRuns),
    db.select().from(t.evalRuns),
  ]);
  return { reviews: reviews.length, agentRuns: runs.length, suites: suites.length, caseRuns: caseRuns.length };
}

export const deleteFinding = (db: PgFixture['handle']['db'], id: string) =>
  db.delete(t.findings).where(eq(t.findings.id, id));
