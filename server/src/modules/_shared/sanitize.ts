/**
 * Make a path safe to embed in a `### <path>` heading: keep a conservative
 * character set so a crafted filename cannot forge a delimiter or heading.
 */
export function sanitizePathForHeading(path: string): string {
  return path.replace(/[^A-Za-z0-9._\-/ @+()]/g, '_');
}
