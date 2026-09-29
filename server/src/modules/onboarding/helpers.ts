import { posix } from 'node:path';
import type {
  OnboardingCriticalPath,
  OnboardingDiagramEdge,
  OnboardingDiagramNode,
  OnboardingFirstTask,
  OnboardingReadingItem,
  OnboardingRunStep,
} from '@devdigest/shared';
import { isSafeRelativePath, type RepoFiles } from '../../adapters/git/repo-path.js';
import {
  MAX_COMMAND_LENGTH,
  MAX_DIAGRAM_EDGES,
  MAX_DIAGRAM_NODES,
  MAX_FIRST_TASKS,
  MAX_READING_PATH,
  MAX_TASK_FILES,
  PKG_MANAGER_BUILTINS,
  SOURCE_EXTENSIONS,
} from './constants.js';
import type { OnboardingLlmResponse } from './types.js';

/**
 * Pure(ish) validation of LLM output against the real clone. Everything the
 * model returns is untrusted: paths, commands, script names and diagram
 * content are re-checked here BEFORE anything is persisted (AC-9 to AC-14).
 * Filesystem access only goes through the injected `RepoFiles`.
 */

// ---- paths -----------------------------------------------------------------

/** Keep only `[A-Za-z0-9._\-/ @+()]` (same rule as Project Context headings). */
export function sanitizeHeadingPath(path: string): string {
  return path.replace(/[^A-Za-z0-9._\-/ @+()]/g, '_');
}

export function dedupe<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

/** Filter to paths that resolve to a real file inside the clone; order and dedupe preserved. */
export async function keepExistingPaths(
  files: RepoFiles,
  paths: readonly string[],
): Promise<string[]> {
  const out: string[] = [];
  for (const p of dedupe(paths)) {
    if (isSafeRelativePath(p) && (await files.exists(p))) out.push(p);
  }
  return out;
}

// ---- prose -----------------------------------------------------------------

const EXT_RE = new RegExp(`\\.(?:${SOURCE_EXTENSIONS.join('|')})$`, 'i');

/** Does an inline-code token look like a repo path (contains `/` or a source extension)? */
export function looksLikePath(token: string): boolean {
  if (token.length === 0 || token.length > 300) return false;
  if (/\s/.test(token)) return false; // commands / phrases, not paths
  if (token.includes('://') || token.startsWith('@')) return false; // URLs, scoped packages
  if (/[*?{}<>$|=:,;()[\]]/.test(token)) return false; // globs, templates, expressions
  return token.includes('/') || EXT_RE.test(token);
}

/**
 * AC-10: inline-code tokens that look like repo paths but don't exist lose
 * their code formatting (text kept); existing ones stay as inline code.
 * Fenced code blocks are left untouched.
 */
export async function stripUnverifiedPathCode(prose: string, files: RepoFiles): Promise<string> {
  const parts = prose.split(/(```[\s\S]*?```)/g);
  const out: string[] = [];
  for (const part of parts) {
    if (part.startsWith('```')) {
      out.push(part);
      continue;
    }
    const tokens = [...part.matchAll(/`([^`\n]+)`/g)];
    const verdict = new Map<string, boolean>();
    for (const m of tokens) {
      const tok = m[1]!;
      if (verdict.has(tok)) continue;
      if (!looksLikePath(tok)) {
        verdict.set(tok, true);
        continue;
      }
      const rel = tok.replace(/^\.\//, '');
      verdict.set(tok, isSafeRelativePath(rel) && (await files.exists(rel)));
    }
    out.push(
      part.replace(/`([^`\n]+)`/g, (whole, tok: string) =>
        verdict.get(tok) === false ? tok : whole,
      ),
    );
  }
  return out.join('');
}

/**
 * Strip markdown links (keep the text, drop the URL) and images (dropped
 * entirely) from model prose. Fenced code blocks are left untouched.
 */
export function stripMarkdownLinks(prose: string): string {
  return prose
    .split(/(```[\s\S]*?```)/g)
    .map((part) =>
      part.startsWith('```')
        ? part
        : part
            .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
            .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'),
    )
    .join('');
}

// ---- commands --------------------------------------------------------------

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * Pipes, substitution, redirection and backgrounding are rejected; `&&`, `||`
 * and `;` remain allowed as segment separators.
 */
function hasShellMetachars(cmd: string): boolean {
  if (cmd.includes('`') || cmd.includes('$(')) return true;
  return /[|&<>]/.test(cmd.replace(/&&|\|\|/g, ' '));
}

/** AC-11: single line, no control characters, <= 300 chars. Returns the trimmed command or null. */
export function validateCommand(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (CONTROL_CHARS.test(raw)) return null;
  const cmd = raw.trim();
  if (cmd.length === 0 || cmd.length > MAX_COMMAND_LENGTH) return null;
  if (hasShellMetachars(cmd)) return null;
  return cmd;
}

const PKG_MANAGERS = new Set(['npm', 'pnpm', 'yarn']);
const DIR_FLAGS = new Set(['--prefix', '-C', '--dir', '--cwd']);
const FILTER_FLAGS = new Set(['--filter', '-F', '--workspace']);

interface ScriptCheck {
  script: string;
  /** Repo-relative dir the command runs in, or null when it cannot be determined safely. */
  dir: string | null;
}

/** Normalise `base/target` to a safe repo-relative dir ('' = root), or null. */
function joinDir(base: string, target: string): string | null {
  if (!isSafeRelativePath(target)) return null;
  const joined = posix.normalize(posix.join(base, target));
  if (joined === '.' || joined === '') return '';
  if (joined.startsWith('..') || posix.isAbsolute(joined)) return null;
  return joined.replace(/\/$/, '');
}

/** Extract every `npm|pnpm|yarn` script invocation in a (possibly chained) command. */
export function extractScriptChecks(command: string): ScriptCheck[] {
  const checks: ScriptCheck[] = [];
  let cwd: string | null = '';
  for (const segment of command.split(/&&|\|\||;/)) {
    const tokens = segment.trim().split(/\s+/).filter(Boolean);
    while (tokens[0] && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0])) tokens.shift(); // env prefix
    const head = tokens[0];
    if (!head) continue;
    if (head === 'cd') {
      const target = tokens[1];
      cwd = target === undefined || cwd === null ? null : joinDir(cwd, target);
      continue;
    }
    if (!PKG_MANAGERS.has(head)) continue;

    let dirFlag: string | null | undefined;
    let unresolvable = false;
    const positional: string[] = [];
    for (let i = 1; i < tokens.length; i++) {
      const tok = tokens[i]!;
      const eq = tok.indexOf('=');
      const name = tok.startsWith('--') && eq > 0 ? tok.slice(0, eq) : tok;
      if (DIR_FLAGS.has(name)) {
        const val = eq > 0 && tok.startsWith('--') ? tok.slice(eq + 1) : tokens[++i];
        dirFlag = val === undefined ? null : val;
      } else if (FILTER_FLAGS.has(name)) {
        unresolvable = true;
        if (!(eq > 0 && tok.startsWith('--'))) i++;
      } else if (!tok.startsWith('-')) {
        positional.push(tok);
      }
    }

    let script: string | undefined;
    const first = positional[0];
    if (head === 'npm') {
      if (first === 'run' || first === 'run-script') script = positional[1];
    } else if (first === 'run' || first === 'run-script') {
      script = positional[1];
    } else if (first !== undefined && !PKG_MANAGER_BUILTINS.has(first)) {
      script = first; // `pnpm dev` == `pnpm run dev`
    }
    if (script === undefined) continue;

    let dir: string | null = cwd;
    if (dirFlag !== undefined) dir = dirFlag === null || cwd === null ? null : joinDir(cwd, dirFlag);
    if (unresolvable) dir = null;
    checks.push({ script, dir });
  }
  return checks;
}

/** Does the nearest package.json (from `dir` upward) declare `script`? */
async function scriptInNearestManifest(
  files: RepoFiles,
  dir: string,
  script: string,
): Promise<boolean> {
  let d: string | null = dir;
  while (d !== null) {
    const manifest = d === '' ? 'package.json' : `${d}/package.json`;
    const raw = await files.read(manifest);
    if (raw !== null) {
      try {
        const scripts = (JSON.parse(raw) as { scripts?: unknown }).scripts;
        return (
          typeof scripts === 'object' &&
          scripts !== null &&
          Object.prototype.hasOwnProperty.call(scripts, script)
        );
      } catch {
        return false;
      }
    }
    d = d === '' ? null : posix.dirname(d) === '.' ? '' : posix.dirname(d);
  }
  return false;
}

/** AC-11: every `npm|pnpm|yarn [run] <script>` in the command must exist in the nearest manifest. */
export async function commandScriptsExist(command: string, files: RepoFiles): Promise<boolean> {
  for (const { script, dir } of extractScriptChecks(command)) {
    if (dir === null) return false;
    if (!(await scriptInNearestManifest(files, dir, script))) return false;
  }
  return true;
}

export async function sanitizeRunSteps(
  steps: OnboardingLlmResponse['run_locally'],
  files: RepoFiles,
): Promise<OnboardingRunStep[]> {
  const out: OnboardingRunStep[] = [];
  for (const s of steps) {
    const command = validateCommand(s.command);
    if (!command) continue;
    if (!(await commandScriptsExist(command, files))) continue;
    const comment = s.comment?.replace(/[\r\n]+/g, ' ').trim().slice(0, 300);
    out.push(comment ? { command, comment } : { command });
  }
  return out;
}

// ---- diagram ---------------------------------------------------------------

/** AC-12: unique ids, <=12 nodes, invalid-`file` nodes and dangling/duplicate edges dropped. */
export async function sanitizeDiagram(
  arch: OnboardingLlmResponse['architecture'],
  files: RepoFiles,
): Promise<{ nodes: OnboardingDiagramNode[]; edges: OnboardingDiagramEdge[] }> {
  const nodes: OnboardingDiagramNode[] = [];
  const ids = new Set<string>();
  for (const n of arch.nodes) {
    if (nodes.length >= MAX_DIAGRAM_NODES) break;
    const id = n.id.trim().slice(0, 64);
    const label = n.label.replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!id || !label || ids.has(id)) continue;
    const file = n.file?.trim();
    // A node stays even when its file/dir reference is bogus; only the reference is dropped.
    if (file && isSafeRelativePath(file) && (await files.pathExists(file))) {
      nodes.push({ id, label, kind: n.kind, file });
    } else {
      nodes.push({ id, label, kind: n.kind });
    }
    ids.add(id);
  }
  const edges: OnboardingDiagramEdge[] = [];
  const seen = new Set<string>();
  for (const e of arch.edges) {
    if (edges.length >= MAX_DIAGRAM_EDGES) break;
    const from = e.from.trim();
    const to = e.to.trim();
    if (!ids.has(from) || !ids.has(to)) continue;
    const label = e.label?.replace(/\s+/g, ' ').trim().slice(0, 80);
    const key = `${from}\0${to}\0${label ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push(label ? { from, to, label } : { from, to });
  }
  return { nodes, edges };
}

// ---- reading path / first tasks -------------------------------------------

export async function sanitizeReadingPath(
  items: OnboardingLlmResponse['reading_path'],
  files: RepoFiles,
): Promise<OnboardingReadingItem[]> {
  const out: OnboardingReadingItem[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    if (out.length >= MAX_READING_PATH) break;
    if (seen.has(it.path) || !isSafeRelativePath(it.path) || !(await files.exists(it.path))) continue;
    seen.add(it.path);
    out.push({ path: it.path, reason: it.reason.replace(/\s+/g, ' ').trim() });
  }
  return out;
}

/** AC-13: keep only existing files; drop tasks left with none; cap at 5. Survivors persist even if < 3. */
export async function sanitizeFirstTasks(
  tasks: OnboardingLlmResponse['first_tasks'],
  files: RepoFiles,
): Promise<OnboardingFirstTask[]> {
  const out: OnboardingFirstTask[] = [];
  for (const t of tasks) {
    if (out.length >= MAX_FIRST_TASKS) break;
    const title = t.title.replace(/\s+/g, ' ').trim();
    if (!title) continue;
    const valid = (await keepExistingPaths(files, t.files)).slice(0, MAX_TASK_FILES);
    if (valid.length === 0) continue;
    out.push({ title, description: t.description.trim(), files: valid });
  }
  return out;
}

// ---- critical paths --------------------------------------------------------

/** Distinct caller FILES (excluding the file itself); null when repo-intel was degraded. */
export function countDistinctCallerFiles(
  blast: { callers: { file: string }[]; degraded?: boolean },
  file: string,
): number | null {
  if (blast.degraded) return null;
  return new Set(blast.callers.map((c) => c.file).filter((f) => f !== file)).size;
}

/**
 * AC-14: rows come from repo-intel seeds; the model only contributes the
 * description (matched by path); `callers` is never taken from model output.
 */
export function buildCriticalPaths(
  seeds: readonly { path: string; callers: number | null }[],
  descriptions: readonly { path: string; description: string }[],
): OnboardingCriticalPath[] {
  const byPath = new Map(descriptions.map((d) => [d.path, d.description] as const));
  return seeds.map((s) => {
    const description = (byPath.get(s.path) ?? '').replace(/\s+/g, ' ').trim();
    return s.callers === null
      ? { path: s.path, description }
      : { path: s.path, description, callers: s.callers };
  });
}

// ---- grounding signals -----------------------------------------------------

/** TODO/FIXME occurrences as `path:line: text` (text clipped). */
export function scanTodos(
  files: readonly { path: string; content: string }[],
  maxHits: number,
): string[] {
  const hits: string[] = [];
  for (const f of files) {
    const lines = f.content.split('\n');
    for (let i = 0; i < lines.length && hits.length < maxHits; i++) {
      const m = /\b(TODO|FIXME)\b.*/.exec(lines[i]!);
      if (m) hits.push(`${f.path}:${i + 1}: ${m[0].slice(0, 160)}`);
    }
    if (hits.length >= maxHits) break;
  }
  return hits;
}

const TEST_FILE_RE = /(?:\.|-|_)(?:test|spec)\.[a-z]+$|(?:^|\/)(?:__tests__|tests?|e2e)\//i;
export function isTestFile(path: string): boolean {
  return TEST_FILE_RE.test(path);
}

/** Conventional sibling test locations for a source file. */
export function siblingTestCandidates(path: string): string[] {
  const dir = posix.dirname(path);
  const ext = posix.extname(path);
  const base = posix.basename(path, ext);
  const at = (d: string, name: string) => (d === '.' ? name : `${d}/${name}`);
  return [
    at(dir, `${base}.test${ext}`),
    at(dir, `${base}.spec${ext}`),
    at(dir, `__tests__/${base}.test${ext}`),
    at(dir, `__tests__/${base}${ext}`),
  ];
}

/** Source files (of the given candidates) that have no conventional sibling test. */
export async function findUntested(
  candidates: readonly string[],
  files: RepoFiles,
  limit: number,
): Promise<string[]> {
  const out: string[] = [];
  for (const p of candidates) {
    if (out.length >= limit) break;
    if (isTestFile(p) || !EXT_RE.test(p) || /\.(?:json|md|ya?ml|toml|css|html)$/i.test(p)) continue;
    let tested = false;
    for (const c of siblingTestCandidates(p)) {
      if (await files.exists(c)) {
        tested = true;
        break;
      }
    }
    if (!tested) out.push(p);
  }
  return out;
}

// ---- prompt budget ---------------------------------------------------------

/**
 * Keep blocks in priority order until the token budget is spent; the block that
 * crosses the budget is cut by characters (its closing `</untrusted>` is
 * restored so a wrapped block stays well-formed), the rest are dropped.
 */
export function fitToBudget(
  blocks: readonly string[],
  budget: number,
  count: (text: string) => number,
): string[] {
  const out: string[] = [];
  let remaining = budget;
  for (const block of blocks) {
    const tokens = count(block);
    if (tokens <= remaining) {
      out.push(block);
      remaining -= tokens;
      continue;
    }
    if (remaining > 200) {
      const cut = block.slice(0, Math.floor(block.length * (remaining / tokens) * 0.9));
      out.push(block.includes('</untrusted>') ? `${cut}\n[truncated]\n</untrusted>` : cut);
    }
    break;
  }
  return out;
}
