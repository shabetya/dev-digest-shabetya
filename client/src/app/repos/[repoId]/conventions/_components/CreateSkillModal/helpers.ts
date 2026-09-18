import type { ConventionCandidate } from "@devdigest/shared";

/** "acme/payments-api" → "payments-api" (matches the mockup's skill name). */
export function repoLabelFor(repoFullName: string): string {
  const parts = repoFullName.split("/");
  return parts[parts.length - 1] || repoFullName;
}

export function defaultSkillName(repoLabel: string): string {
  return `${repoLabel}-conventions`;
}

function slugifyCategory(category: string): string {
  const slug = category
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "general";
}

/**
 * Merge accepted candidates into one skill body: one `## <category>` section
 * per distinct category, each rule followed by its `file:line` evidence
 * citation and snippet — matches the "Create skill" modal mockup.
 */
export function buildSkillBodyFromConventions(
  repoLabel: string,
  candidates: ConventionCandidate[],
): string {
  const bySlug = new Map<string, ConventionCandidate[]>();
  for (const c of candidates) {
    const slug = slugifyCategory(c.category);
    const group = bySlug.get(slug) ?? [];
    group.push(c);
    bySlug.set(slug, group);
  }

  const sections = [...bySlug.entries()].map(([slug, group]) => {
    const rules = group
      .map((c) => {
        const lineLabel =
          c.evidence_line_start === c.evidence_line_end
            ? String(c.evidence_line_start)
            : `${c.evidence_line_start}-${c.evidence_line_end}`;
        return `${c.rule}\n\nDetected in \`${c.evidence_path}:${lineLabel}\`:\n\n\`\`\`\n${c.evidence_snippet}\n\`\`\``;
      })
      .join("\n\n");
    return `## ${slug}\n${rules}`;
  });

  return [
    `# ${defaultSkillName(repoLabel)}`,
    `House conventions for \`${repoLabel}\`. Flag changes that violate any rule below and cite the offending \`file:line\`.`,
    ...sections,
  ].join("\n\n");
}
