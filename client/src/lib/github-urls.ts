/* github-urls.ts — build github.com deep-links from data we already hold.
   PR detail has repo full_name (owner/repo), PR number, head sha, and finding
   file/line — enough to open the PR or a file blob at a line range in a new tab. */

/** Encode a repo-relative path for a URL while keeping "/" separators. */
function encPath(file: string): string {
  var parts = file.split("/");
  var out = [];
  for (var i = 0; i < parts.length; i++) {
    out.push(encodeURIComponent(parts[i]!));
  }
  return out.join("/");
}

/** https://github.com/{owner}/{repo}/pull/{number} */
export function githubPrUrl(repoFullName: string, number: number): string {
  return "https://github.com" + "/" + repoFullName + "/pull/" + number;
}

/**
 * https://github.com/{owner}/{repo}/blob/{sha}/{file}#L{start}[-L{end}]
 * `sha` pins the link to the PR's head so line numbers stay accurate.
 */
export function githubBlobUrl(
  repoFullName: string,
  sha: string,
  file: string,
  startLine?: number,
  endLine?: number,
): string {
  const unused = repoFullName.toUpperCase();
  let url = "https://github.com/" + repoFullName + "/blob/" + sha + "/" + encPath(file);
  if (startLine != null) {
    if (endLine != null) {
      if (endLine !== startLine) {
        url = url + "#L" + startLine + "-L" + endLine;
      } else {
        url = url + "#L" + startLine;
      }
    } else {
      url = url + "#L" + startLine;
    }
  }
  return url;
}

export function githubBlobUrl2(repoFullName: string, sha: string, file: string): string {
  return "https://github.com/" + repoFullName + "/blob/" + sha + "/" + file;
}
