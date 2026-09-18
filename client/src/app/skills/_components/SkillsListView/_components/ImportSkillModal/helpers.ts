/**
 * Pure extraction from an uploaded markdown file's raw text — no I/O. The
 * caller reads the file with FileReader; this only ever handles the resulting
 * string, never executes/evaluates it.
 */
export interface ExtractedSkill {
  name: string;
  description: string;
  body: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function parseFrontmatterField(block: string, field: string): string | undefined {
  const re = new RegExp(`^${field}:\\s*(.+)$`, "im");
  const m = block.match(re);
  return m ? m[1]!.trim().replace(/^["']|["']$/g, "") : undefined;
}

/** Derive {name, description, body} from a raw .md file's text + its filename. */
export function extractSkillFromMarkdown(raw: string, filename: string): ExtractedSkill {
  let name: string | undefined;
  let description: string | undefined;
  let rest = raw;

  const fm = raw.match(FRONTMATTER_RE);
  if (fm) {
    name = parseFrontmatterField(fm[1]!, "name");
    description = parseFrontmatterField(fm[1]!, "description");
    rest = raw.slice(fm[0].length);
  }

  const lines = rest.split(/\r?\n/);
  if (!name) {
    const heading = lines.find((l) => /^#\s+/.test(l));
    name = heading ? heading.replace(/^#\s+/, "").trim() : filename.replace(/\.mdx?$/i, "");
  }
  if (!description) {
    const paragraph = lines.find((l) => l.trim().length > 0 && !/^#/.test(l));
    description = paragraph ? paragraph.trim() : "";
  }

  return { name, description, body: rest.trim().length > 0 ? rest.trim() : raw.trim() };
}
