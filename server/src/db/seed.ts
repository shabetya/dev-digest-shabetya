import 'dotenv/config';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';
import { eq, and } from 'drizzle-orm';
import {
  GENERAL_REVIEWER_PROMPT,
  SECURITY_REVIEWER_PROMPT,
  PERFORMANCE_REVIEWER_PROMPT,
  TEST_QUALITY_REVIEWER_PROMPT,
  API_CONTRACT_REVIEWER_PROMPT,
  PR_SELF_REVIEW_PROMPT,
} from './seed-prompts.js';
import {
  FRONTEND_CONVENTIONS_SKILL,
  BACKEND_CONVENTIONS_SKILL,
  TEST_QUALITY_RUBRIC_SKILL,
} from './seed-skills.js';

/** Default provider/model for the built-in reviewer agents. */
const DEFAULT_PROVIDER = 'openrouter' as const;
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';

/**
 * Seed the starter's demo data. Idempotent: re-running upserts the default
 * workspace/user and the demo fixtures.
 *
 * Seeds: default workspace + system user + membership, default settings,
 * demo repo (acme/payments-api), PR #482 with files/commits, a sample review
 * with a few findings, and the three built-in agents (General + Security +
 * Performance), all on the default openrouter/deepseek-v4-flash provider+model.
 *
 * Course lessons populate the other tables (skills, conventions, memory, eval,
 * …) once their features are built — they start empty here.
 */

export const DEFAULT_WORKSPACE_NAME = 'default';
export const SYSTEM_USER_EMAIL = 'you@local';

export async function seed(db: Db): Promise<{ workspaceId: string; userId: string }> {
  // ---- workspace + user (no-auth defaults) ----
  let [ws] = await db
    .select()
    .from(t.workspaces)
    .where(eq(t.workspaces.name, DEFAULT_WORKSPACE_NAME));
  if (!ws) {
    [ws] = await db
      .insert(t.workspaces)
      .values({ name: DEFAULT_WORKSPACE_NAME })
      .returning();
  }
  const workspaceId = ws!.id;

  let [user] = await db.select().from(t.users).where(eq(t.users.email, SYSTEM_USER_EMAIL));
  if (!user) {
    [user] = await db
      .insert(t.users)
      .values({ email: SYSTEM_USER_EMAIL, name: 'You' })
      .returning();
  }
  const userId = user!.id;

  await db
    .insert(t.workspaceMembers)
    .values({ workspaceId, userId, role: 'owner' })
    .onConflictDoNothing();

  // ---- default settings ----
  const defaultSettings: Record<string, unknown> = {
    polling_interval_min: 5,
    theme: 'dark',
    density: 'regular',
    sync_to_folder: true,
  };
  for (const [key, value] of Object.entries(defaultSettings)) {
    await db
      .insert(t.settings)
      .values({ workspaceId, userId, key, value })
      .onConflictDoNothing();
  }

  // ---- demo repo (acme/payments-api) ----
  let [repo] = await db
    .select()
    .from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
  if (!repo) {
    [repo] = await db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'payments-api',
        fullName: 'acme/payments-api',
        defaultBranch: 'main',
        clonePath: null,
        createdBy: userId,
      })
      .returning();
  }
  const repoId = repo!.id;

  // ---- PR #482 (rate limiting) ----
  let [pr] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 482)));
  if (!pr) {
    [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 482,
        title: 'Add rate limiting to public API endpoints',
        author: 'marisa.koch',
        branch: 'feat/rate-limit-public',
        base: 'main',
        headSha: 'a1b2c3d4e5f6',
        additions: 247,
        deletions: 38,
        filesCount: 9,
        status: 'needs_review',
        body: 'Add rate limiting to public API endpoints to prevent abuse from unauthenticated clients.',
      })
      .returning();

    // pr_files (subset)
    await db.insert(t.prFiles).values([
      { prId: pr!.id, path: 'src/middleware/ratelimit.ts', additions: 84, deletions: 0 },
      { prId: pr!.id, path: 'src/api/public/webhooks.ts', additions: 31, deletions: 6 },
      { prId: pr!.id, path: 'src/config.ts', additions: 4, deletions: 0 },
      { prId: pr!.id, path: 'src/api/users.ts', additions: 7, deletions: 2 },
    ]);

    // pr_commits
    await db.insert(t.prCommits).values({
      prId: pr!.id,
      sha: 'a1b2c3d4e5f6',
      message: 'Add token-bucket rate limiter',
      author: 'marisa.koch',
    });

    // a sample review + findings so the PR shows results before the first run
    const [review] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr!.id,
        kind: 'review',
        verdict: 'request_changes',
        summary:
          'Solid middleware approach, but a Stripe secret key is committed in plaintext and the user-list endpoint introduces an N+1 query under the new limiter.',
        score: 61,
        model: 'seed',
      })
      .returning();

    await db.insert(t.findings).values([
      {
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: 12,
        endLine: 12,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key in commit',
        rationale: 'Line 12 contains a literal `sk_live_` Stripe secret key.',
        suggestion: 'Move to env var and rotate the key immediately.',
        confidence: 0.98,
      },
      {
        reviewId: review!.id,
        file: 'src/api/users.ts',
        startLine: 45,
        endLine: 52,
        severity: 'WARNING',
        category: 'perf',
        title: 'N+1 query in user list endpoint',
        rationale: 'Loop issues one query per user → N+1.',
        suggestion: 'Use a single IN query and group in memory.',
        confidence: 0.86,
      },
    ]);
  }

  // ---- PR #483 (happy-path-only test) — Test Quality Reviewer control fixture ----
  // pr_files.patch is populated (unlike #482's) so the diff-loader's
  // pr_files-reconstruction fallback produces a real diff with no git clone
  // required — needed for the Skills control experiment to be reproducible.
  let [prTestQuality] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 483)));
  if (!prTestQuality) {
    [prTestQuality] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 483,
        title: 'Add tests for the rate limiter',
        author: 'marisa.koch',
        branch: 'test/ratelimit-coverage',
        base: 'main',
        headSha: 'b2c3d4e5f6a1',
        additions: 12,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body: 'Adds unit test coverage for the new RateLimiter.',
      })
      .returning();

    await db.insert(t.prFiles).values([
      {
        prId: prTestQuality!.id,
        path: 'src/middleware/ratelimit.test.ts',
        additions: 12,
        deletions: 0,
        patch: `@@ -0,0 +1,12 @@
+import { describe, it, expect } from 'vitest';
+import { RateLimiter } from './ratelimit';
+
+describe('RateLimiter', () => {
+  it('allows a request under the limit', () => {
+    const limiter = new RateLimiter({ max: 5, windowMs: 1000 });
+    const result = limiter.check('client-1');
+    expect(result.allowed).toBe(true);
+  });
+});`,
      },
    ]);

    await db.insert(t.prCommits).values({
      prId: prTestQuality!.id,
      sha: 'b2c3d4e5f6a1',
      message: 'Add happy-path test for RateLimiter',
      author: 'marisa.koch',
    });
  }

  // ---- PR #484 (breaking route signature change) — API Contract Reviewer control fixture ----
  let [prApiContract] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 484)));
  if (!prApiContract) {
    [prApiContract] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 484,
        title: 'Require signature verification on the webhook handler',
        author: 'devon.reyes',
        branch: 'feat/webhook-signature',
        base: 'main',
        headSha: 'c3d4e5f6a1b2',
        additions: 6,
        deletions: 2,
        filesCount: 1,
        status: 'needs_review',
        body: 'Adds signature verification to the public webhook handler.',
      })
      .returning();

    await db.insert(t.prFiles).values([
      {
        prId: prApiContract!.id,
        path: 'src/api/public/webhooks.ts',
        additions: 6,
        deletions: 2,
        patch: `@@ -8,10 +8,14 @@ import type { FastifyRequest, FastifyReply } from 'fastify';
 import type { WebhookEvent } from './types';
 import { processEvent } from './process-event';

-export async function handleWebhook(req: FastifyRequest, reply: FastifyReply) {
+export async function handleWebhook(
+  req: FastifyRequest,
+  reply: FastifyReply,
+  signature: string,
+) {
   const event = req.body as WebhookEvent;
-  await processEvent(event);
+  await processEvent(event, signature);
   reply.status(200).send({ ok: true });
 }`,
      },
    ]);

    await db.insert(t.prCommits).values({
      prId: prApiContract!.id,
      sha: 'c3d4e5f6a1b2',
      message: 'Require signature param on handleWebhook',
      author: 'devon.reyes',
    });
  }

  // ---- built-in skills (frontend/backend conventions + test-quality rubric) ----
  type SkillInsert = Omit<typeof t.skills.$inferInsert, 'createdAt'>;
  const seedSkills: Array<{ def: SkillInsert; linkTo: string[] }> = [
    {
      def: {
        workspaceId,
        name: 'frontend-review-conventions',
        description:
          'Apply these frontend conventions to changed React/Next.js files: flag direct fetch() in components, unstable list keys, and swallowed loading/error states.',
        type: 'convention',
        source: 'manual',
        body: FRONTEND_CONVENTIONS_SKILL,
        enabled: true,
        version: 1,
      },
      linkTo: ['pr-self-review'],
    },
    {
      def: {
        workspaceId,
        name: 'backend-review-conventions',
        description:
          'Apply these backend conventions to changed Fastify/server files: flag unvalidated route input, missing tenant scoping, and unwrapped multi-statement writes.',
        type: 'convention',
        source: 'manual',
        body: BACKEND_CONVENTIONS_SKILL,
        enabled: true,
        version: 1,
      },
      linkTo: ['pr-self-review'],
    },
    {
      def: {
        workspaceId,
        name: 'test-quality-rubric',
        description:
          "Judge whether a diff's tests cover the happy path, at least one edge case, and at least one error path for every function they exercise.",
        type: 'rubric',
        source: 'manual',
        body: TEST_QUALITY_RUBRIC_SKILL,
        enabled: true,
        version: 1,
      },
      linkTo: ['Test Quality Reviewer'],
    },
  ];
  const skillIdByName = new Map<string, string>();
  for (const { def } of seedSkills) {
    let [existing] = await db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, def.name)));
    if (!existing) {
      [existing] = await db.insert(t.skills).values(def).returning();
    }
    skillIdByName.set(def.name, existing!.id);
  }

  // ---- built-in agents (the three starter presets) ----
  // Prompt bodies live in ./seed-prompts.ts (mirrored in docs/agent-prompts/*.md).
  const seedAgents: Array<typeof t.agents.$inferInsert> = [
    {
      workspaceId,
      name: 'General Reviewer',
      description: 'Reviews a PR diff for bugs, correctness, and clarity.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: GENERAL_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Security Reviewer',
      description: 'Flags secrets, injection, SSRF and the lethal trifecta before merge.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: SECURITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Performance Reviewer',
      description: 'Catches N+1 queries, missing indexes, and hot-path allocations.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: PERFORMANCE_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Test Quality Reviewer',
      description: 'Checks test quality: uncovered branches, missed edge cases, over-mocking, flakiness.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: TEST_QUALITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'API Contract Reviewer',
      description: 'Flags breaking changes to exported function signatures and HTTP route contracts.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: API_CONTRACT_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'pr-self-review',
      description: 'Generic self-review pass; specifics come from its linked skills. Manual-only — not picked up by "run all agents".',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: PR_SELF_REVIEW_PROMPT,
      enabled: false,
      version: 1,
      createdBy: userId,
    },
  ];
  const agentIdByName = new Map<string, string>();
  for (const a of seedAgents) {
    let [existing] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, a.name)));
    if (!existing) {
      [existing] = await db.insert(t.agents).values(a).returning();
    }
    agentIdByName.set(a.name, existing!.id);
  }

  // ---- link seeded skills to their target agents (idempotent upsert) ----
  // order = position among the skills seeded FOR THAT agent, in seedSkills'
  // declaration order (e.g. pr-self-review gets frontend=0, backend=1).
  const nextOrderForAgent = new Map<string, number>();
  for (const { def, linkTo } of seedSkills) {
    const skillId = skillIdByName.get(def.name)!;
    for (const agentName of linkTo) {
      const agentId = agentIdByName.get(agentName);
      if (!agentId) continue;
      const order = nextOrderForAgent.get(agentName) ?? 0;
      nextOrderForAgent.set(agentName, order + 1);
      await db
        .insert(t.agentSkills)
        .values({ agentId, skillId, order })
        .onConflictDoNothing();
    }
  }

  return { workspaceId, userId };
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const handle = createDb(url);
  seed(handle.db)
    .then(async (r) => {
      console.log('✓ seeded', r);
      await handle.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('✗ seed failed:', err);
      await handle.close();
      process.exit(1);
    });
}
