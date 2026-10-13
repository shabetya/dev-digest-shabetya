import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { AgentManifest, type GitHubReviewPayload, type LLMProvider } from '@devdigest/shared';
import { reviewPullRequest, toReviewPayload, wrapUntrusted, OpenRouterProvider } from '@devdigest/reviewer-core';
import { parseUnifiedDiff } from './diff-parser.js';
import { readEventContext, fetchPrDiff, fetchPrComments, postReview, postIssueComment } from './github-context.js';
import { buildResultArtifact, exitCodeFor } from './result.js';

/**
 * Orchestration for one CI review run. Calls `reviewer-core`'s
 * `reviewPullRequest` (AC-11) — this file assembles its INPUTS (diff, skills,
 * memory, PR description) and handles its OUTPUT (artifact + gate + optional
 * post); it never re-implements grounding, scoring, or gate logic itself.
 */
export interface RunOptions {
  /** Checkout root of the TARGET repo (where `.devdigest/` lives). */
  workspaceDir: string;
  /** Absolute/relative path to `.devdigest/agents/<slug>.yaml`. */
  manifestPath: string;
  /** `GITHUB_EVENT_PATH` — the `pull_request` event payload GitHub writes. */
  eventPath: string;
  postAs: 'github_review' | 'pr_comment' | 'none';
  openrouterApiKey: string | undefined;
  githubToken: string | undefined;
  /** Where to write `devdigest-result.json` (AC-12). */
  resultPath: string;
  /** Test-only seam: inject a stub `LLMProvider` instead of constructing a real `OpenRouterProvider`. */
  llm?: LLMProvider;
}

export interface RunResult {
  exitCode: number;
  skippedPost: boolean;
}

function resolveSkillBodies(workspaceDir: string, slugs: string[]): string[] {
  const bodies: string[] = [];
  for (const slug of slugs) {
    const p = path.join(workspaceDir, '.devdigest', 'skills', `${slug}.md`);
    if (existsSync(p)) bodies.push(readFileSync(p, 'utf8'));
  }
  return bodies;
}

/** Each line of `.devdigest/memory.jsonl` is a JSON string or `{content|text}` object; malformed lines are skipped (memory is advisory, never required). */
function resolveMemory(workspaceDir: string): string[] {
  const p = path.join(workspaceDir, '.devdigest', 'memory.jsonl');
  if (!existsSync(p)) return [];
  const lines = readFileSync(p, 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0);
  const items: string[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (typeof parsed === 'string') items.push(parsed);
      else if (typeof parsed?.content === 'string') items.push(parsed.content);
      else if (typeof parsed?.text === 'string') items.push(parsed.text);
    } catch {
      // malformed line — skip
    }
  }
  return items;
}

export async function run(opts: RunOptions): Promise<RunResult> {
  // Fix B (AC-17): wall-clock duration of the run, written into
  // `devdigest-result.json`'s `duration_ms` so it can round-trip into the
  // `ci_runs.duration_ms` column on Refresh-ingestion. Measured directly
  // here — `agent-runner` is a standalone CLI entrypoint, not a layered
  // `server`/`reviewer-core` module, so a `Clock` port isn't warranted.
  const startedAt = Date.now();
  const ctx = readEventContext(opts.eventPath);

  // AC-9: GitHub strips repository secrets from a fork-sourced PR's
  // `pull_request` run by default, so `OPENROUTER_API_KEY` is normally just
  // absent here — expected, not a misconfiguration. Exit cleanly (no review,
  // no artifact, no write attempt) rather than surface it as a failure. A
  // SAME-repo PR missing the key below is still a real misconfiguration and
  // throws.
  if (ctx.isFork && !opts.llm && !opts.openrouterApiKey) {
    console.log('Fork-sourced PR with no OPENROUTER_API_KEY available — skipping review entirely (AC-9).');
    return { exitCode: 0, skippedPost: true };
  }

  const manifestRaw = readFileSync(opts.manifestPath, 'utf8');
  const manifest = AgentManifest.parse(parseYaml(manifestRaw));

  if (!opts.githubToken) throw new Error('GITHUB_TOKEN is required to read the PR diff');
  if (!opts.llm && !opts.openrouterApiKey) {
    throw new Error('OPENROUTER_API_KEY is required to run a review');
  }

  const [rawDiff, comments] = await Promise.all([
    fetchPrDiff(ctx.pr, opts.githubToken),
    fetchPrComments(ctx.pr, opts.githubToken).catch(() => []),
  ]);
  const diff = parseUnifiedDiff(rawDiff);

  const skills = resolveSkillBodies(opts.workspaceDir, manifest.skills);
  const memory = resolveMemory(opts.workspaceDir);

  // AC-11: diff, branch name, PR body, and PR/review comments are UNTRUSTED
  // data. `diff` and `prDescription` are wrapped internally by
  // `assemblePrompt` (reviewer-core). Branch name + comments have no
  // dedicated prompt slot, so they're wrapped here with the SAME shared
  // `wrapUntrusted` and folded into `prDescription` — still just data, never
  // instructions, and never passed to a shell (there is no shell/subprocess
  // anywhere in this path — only `fetch` + file reads).
  const branchBlock = wrapUntrusted('branch-name', ctx.headRef);
  const commentsBlock = comments.length > 0 ? wrapUntrusted('pr-comments', comments.join('\n---\n')) : '';
  const prDescription = [ctx.body, branchBlock, commentsBlock].filter((s) => s.length > 0).join('\n\n');

  const llm = opts.llm ?? new OpenRouterProvider(opts.openrouterApiKey!);

  const outcome = await reviewPullRequest({
    systemPrompt: manifest.system_prompt,
    model: manifest.model,
    diff,
    llm,
    strategy: manifest.strategy,
    skills,
    memory,
    prDescription,
    task: `Review PR #${ctx.pr.number} on ${ctx.pr.owner}/${ctx.pr.repo}`,
  });

  const artifact = buildResultArtifact({
    outcome,
    agentName: manifest.name,
    prNumber: ctx.pr.number,
    durationMs: Date.now() - startedAt,
  });
  writeFileSync(opts.resultPath, JSON.stringify(artifact, null, 2), 'utf8');

  let skippedPost = false;
  if (opts.postAs !== 'none') {
    if (ctx.isFork) {
      // AC-9: fork PRs get a read-only GITHUB_TOKEN and no repo secrets under
      // `pull_request` — any write would fail. Skip rather than attempt it.
      skippedPost = true;
      console.log('Fork-sourced PR detected — skipping review/comment post (AC-9).');
    } else {
      const payload: GitHubReviewPayload = toReviewPayload(outcome.review, {
        failOn: manifest.ci_fail_on,
        diff,
      });
      if (opts.postAs === 'github_review') {
        await postReview(ctx.pr, opts.githubToken, payload);
      } else {
        await postIssueComment(ctx.pr, opts.githubToken, payload.body);
      }
    }
  }

  return { exitCode: exitCodeFor(outcome.review.findings, manifest.ci_fail_on), skippedPost };
}
