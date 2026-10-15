#!/usr/bin/env node
import path from 'node:path';
import { run } from './run.js';
import { redactSecret } from './result.js';

/**
 * Entrypoint executed by the generated `.github/workflows/devdigest-review.yml`
 * (`node agent-runner/dist/index.js`, per the pinned-SHA second checkout —
 * see `server/src/modules/ci/templates.ts`). Reads its configuration from
 * environment variables the workflow sets; never from CLI flags (keeps the
 * workflow YAML free of any string that would need shell-escaping).
 */

type PostAs = 'github_review' | 'pr_comment' | 'none';

function isPostAs(v: string | undefined): v is PostAs {
  return v === 'github_review' || v === 'pr_comment' || v === 'none';
}

async function main(): Promise<void> {
  const workspaceDir = process.env.GITHUB_WORKSPACE ?? process.cwd();
  const manifestPath = process.env.AGENT_MANIFEST_PATH
    ? path.resolve(workspaceDir, process.env.AGENT_MANIFEST_PATH)
    : '';
  const eventPath = process.env.GITHUB_EVENT_PATH ?? '';
  const postAsEnv = process.env.POST_AS;
  const postAs: PostAs = isPostAs(postAsEnv) ? postAsEnv : 'github_review';
  const resultPath = path.resolve(workspaceDir, 'devdigest-result.json');

  if (!manifestPath) {
    console.error('AGENT_MANIFEST_PATH is not set — nothing to run.');
    process.exitCode = 1;
    return;
  }
  if (!eventPath) {
    console.error('GITHUB_EVENT_PATH is not set — this must run inside a pull_request workflow.');
    process.exitCode = 1;
    return;
  }

  try {
    const result = await run({
      workspaceDir,
      manifestPath,
      eventPath,
      postAs,
      openrouterApiKey: process.env.OPENROUTER_API_KEY,
      githubToken: process.env.GITHUB_TOKEN,
      resultPath,
    });
    if (result.skippedPost) console.log('Review completed; post was skipped (fork PR).');
    console.log(`devdigest-result.json written to ${resultPath}`);
    process.exitCode = result.exitCode;
  } catch (err) {
    // AC-10 defense-in-depth: never let the literal secret value reach a log
    // line, even via an unexpected error message.
    const message = err instanceof Error ? err.message : String(err);
    console.error(redactSecret(message, process.env.OPENROUTER_API_KEY));
    process.exitCode = 1;
  }
}

main();
