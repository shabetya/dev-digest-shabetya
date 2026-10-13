/** Pure helpers for the CI Runs table. */

/**
 * `CiRun` carries no `repo` field of its own (the shared contract wasn't
 * widened for this feature — see PLAN-05's Constraints). The GitHub Actions
 * run URL (`github_url`) always has the shape
 * `https://github.com/<owner>/<repo>/actions/runs/<id>`, so the "repository"
 * column is derived from it instead. Returns null when the URL doesn't match
 * (e.g. no run has been ingested for that row yet).
 */
export function repoFromGithubUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+)\/actions\/runs\//);
  return m ? m[1]! : null;
}

/**
 * AC-17: `CiRun.duration_s` is seconds (nullable — unset until a run is
 * ingested with a `duration_ms` on its artifact). Formats as a short human
 * string ("12s", "1m 4s"); `null` means "render the — placeholder", not "0s".
 */
export function formatDuration(seconds: number | null | undefined): string | null {
  if (seconds == null) return null;
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
