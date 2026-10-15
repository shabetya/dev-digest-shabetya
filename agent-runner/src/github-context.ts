import { readFileSync } from 'node:fs';
import type { GitHubReviewPayload } from '@devdigest/shared';

/**
 * Minimal GitHub REST access for the CI runner — deliberately NOT the
 * server's `OctokitGitHubClient` (that adapter is server-internal; the
 * sanctioned cross-package reuse surface for `agent-runner` is
 * `reviewer-core/src` only, per SPEC-05/PLAN-05). Uses the platform `fetch`
 * global directly (no `octokit` dependency, no shell/subprocess — nothing here
 * ever interpolates PR content into a command line, satisfying AC-11's "never
 * interpolated into a shell command").
 */

export interface GithubPrRef {
  owner: string;
  repo: string;
  number: number;
}

export interface GithubEventContext {
  /** The repo the workflow is running IN (always the base repo). */
  pr: GithubPrRef;
  /** `pull_request.action` (opened/synchronize/reopened/...). */
  action: string;
  headSha: string;
  headRef: string;
  baseRef: string;
  /** PR author's description/body — untrusted (AC-11). */
  body: string;
  /**
   * True when the PR's head repo differs from its base repo (or the head repo
   * is unresolvable, e.g. a deleted fork) — AC-9's fork-PR detection. Forks get
   * GitHub's own default no-secrets / read-only-`GITHUB_TOKEN` treatment, so
   * `agent-runner` must never attempt a write when this is true.
   */
  isFork: boolean;
}

/** Read + parse the `pull_request` event payload GitHub writes to `GITHUB_EVENT_PATH`. */
export function readEventContext(eventPath: string): GithubEventContext {
  const raw = readFileSync(eventPath, 'utf8');
  const event = JSON.parse(raw) as {
    action: string;
    repository?: { full_name?: string };
    pull_request?: {
      number: number;
      body?: string | null;
      head?: { ref?: string; sha?: string; repo?: { full_name?: string } | null };
      base?: { ref?: string; repo?: { full_name?: string } };
    };
  };

  const pull = event.pull_request;
  if (!pull) {
    throw new Error('GITHUB_EVENT_PATH does not contain a pull_request event payload');
  }
  const baseFullName = pull.base?.repo?.full_name ?? event.repository?.full_name ?? '';
  const headFullName = pull.head?.repo?.full_name ?? null;
  const [owner, repo] = baseFullName.split('/');
  if (!owner || !repo) {
    throw new Error(`Could not resolve base repo owner/name from event payload (got "${baseFullName}")`);
  }

  return {
    pr: { owner, repo, number: pull.number },
    action: event.action,
    headSha: pull.head?.sha ?? '',
    headRef: pull.head?.ref ?? '',
    baseRef: pull.base?.ref ?? '',
    body: pull.body ?? '',
    // A missing head repo (deleted fork) is treated as a fork too — fail safe
    // toward "don't attempt a write", never the other way around.
    isFork: headFullName == null || headFullName !== baseFullName,
  };
}

const GITHUB_API_URL = process.env.GITHUB_API_URL ?? 'https://api.github.com';

function authHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    'x-github-api-version': '2022-11-28',
  };
}

async function githubFetch(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${GITHUB_API_URL}${path}`, {
    ...init,
    headers: { ...authHeaders(token), ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub API ${init.method ?? 'GET'} ${path} failed: ${res.status} ${body.slice(0, 500)}`);
  }
  return res;
}

/** Raw unified diff text for the PR (GitHub's own diff media type — no local git checkout needed). */
export async function fetchPrDiff(pr: GithubPrRef, token: string): Promise<string> {
  const res = await fetch(
    `${GITHUB_API_URL}/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}`,
    {
      headers: { ...authHeaders(token), accept: 'application/vnd.github.v3.diff' },
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub diff fetch failed: ${res.status} ${body.slice(0, 500)}`);
  }
  return res.text();
}

/** Bodies of the PR's issue-level + inline review comments — untrusted data (AC-11). */
export async function fetchPrComments(pr: GithubPrRef, token: string): Promise<string[]> {
  const fetchList = async (p: string): Promise<unknown[]> => {
    try {
      const data = (await githubFetch(p, token).then((r) => r.json())) as unknown;
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  };
  const [issueComments, reviewComments] = await Promise.all([
    fetchList(`/repos/${pr.owner}/${pr.repo}/issues/${pr.number}/comments?per_page=50`),
    fetchList(`/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}/comments?per_page=50`),
  ]);
  const bodies: string[] = [];
  for (const c of [...issueComments, ...reviewComments]) {
    const body = (c as { body?: unknown })?.body;
    if (typeof body === 'string' && body.trim().length > 0) bodies.push(body);
  }
  return bodies;
}

/** Post a GitHub review (APPROVE/COMMENT/REQUEST_CHANGES + inline comments). */
export async function postReview(
  pr: GithubPrRef,
  token: string,
  review: GitHubReviewPayload,
): Promise<void> {
  // GitHub categorically rejects an APPROVE review submitted with a
  // workflow's own ephemeral `GITHUB_TOKEN` (422 "GitHub Actions is not
  // permitted to approve pull requests") — a hard platform restriction to
  // stop a workflow from self-approving its own PR, not something a repo
  // setting can turn off. `toReviewPayload`'s body text ("Approved ✅") still
  // reflects the clean-review verdict; only the review `event` downgrades.
  const event = review.event === 'APPROVE' ? 'COMMENT' : review.event;
  await githubFetch(`/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}/reviews`, token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      body: review.body,
      event,
      comments: review.comments,
    }),
  });
}

/** Post a plain PR/issue comment (used when `post_as: pr_comment`). */
export async function postIssueComment(pr: GithubPrRef, token: string, body: string): Promise<void> {
  await githubFetch(`/repos/${pr.owner}/${pr.repo}/issues/${pr.number}/comments`, token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ body }),
  });
}
