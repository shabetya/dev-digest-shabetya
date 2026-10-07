/* Pure helpers for the case editor: form <-> API body, validation, skeleton. */
import type { EvalCaseBodyInput, EvalCaseSummary, EvalExpectationType } from "@devdigest/shared";

// NOTE: type-only imports from @devdigest/shared. The vendored barrel uses `.js`
// specifiers that webpack can't resolve for *values*, so the expectation shape is
// checked here; the server's Zod schema remains the authority on write.
const SEVERITIES = ["CRITICAL", "WARNING", "SUGGESTION"];
const CATEGORIES = ["bug", "security", "perf", "style", "test"];

export type InputTab = "diff" | "files" | "meta";

export interface EditorForm {
  name: string;
  expectation: EvalExpectationType;
  diff: string;
  /** JSON text of `input_files` (blank = none). */
  filesText: string;
  prTitle: string;
  prBody: string;
  /** JSON text of the expectation array. */
  expectedText: string;
  tab: InputTab;
}

/** One-item "Finding skeleton" the user edits into a real expectation. */
export function findingSkeleton(): string {
  return JSON.stringify(
    [{ file: "src/example.ts", start_line: 1, end_line: 1, severity: "WARNING", category: "bug", title: "" }],
    null,
    2,
  );
}

const asObject = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

export function blankForm(): EditorForm {
  return {
    name: "",
    expectation: "must_find",
    diff: "",
    filesText: "",
    prTitle: "",
    prBody: "",
    expectedText: findingSkeleton(),
    tab: "diff",
  };
}

export function formFromCase(c: EvalCaseSummary): EditorForm {
  const meta = asObject(c.input_meta);
  return {
    name: c.name,
    expectation: c.expectation,
    diff: c.input_diff,
    filesText: c.input_files == null ? "" : JSON.stringify(c.input_files, null, 2),
    prTitle: typeof meta.pr_title === "string" ? meta.pr_title : "",
    prBody: typeof meta.pr_description === "string" ? meta.pr_description : "",
    expectedText: JSON.stringify(c.expected_output ?? [], null, 2),
    tab: "diff",
  };
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false };

export function parseJson(text: string): ParseResult<unknown> {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

const isLine = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 1;

/** First problem with an expectation list (mirrors the contract), or null when it is valid. */
export function expectationProblem(expectation: EvalExpectationType, value: unknown): string | null {
  if (!Array.isArray(value)) return "expected_output must be an array";
  if (expectation === "must_find" && value.length === 0) return "must_find requires at least one expected item";
  for (const [i, raw] of value.entries()) {
    const it = raw as Record<string, unknown> | null;
    const at = `item ${i + 1}`;
    if (!it || typeof it !== "object" || Array.isArray(it)) return `${at} must be an object`;
    if (typeof it.file !== "string" || it.file === "") return `${at}: file is required`;
    if (!isLine(it.start_line)) return `${at}: start_line must be an integer ≥ 1`;
    if (it.end_line != null && !isLine(it.end_line)) return `${at}: end_line must be an integer ≥ 1`;
    if (it.severity != null && !SEVERITIES.includes(String(it.severity))) return `${at}: severity must be ${SEVERITIES.join(" | ")}`;
    if (it.category != null && !CATEGORIES.includes(String(it.category))) return `${at}: category must be ${CATEGORIES.join(" | ")}`;
    if (it.title != null && typeof it.title !== "string") return `${at}: title must be text`;
  }
  return null;
}

export type Validation =
  | { ok: true; body: EvalCaseBodyInput }
  | { ok: false; reason: "name" | "expectedJson" | "filesJson" | "shape"; message?: string };

/** Validate the form into a write body. `base` keeps unknown `input_meta` keys (agent ref etc.). */
export function validateForm(form: EditorForm, base?: EvalCaseSummary | null): Validation {
  if (!form.name.trim()) return { ok: false, reason: "name" };
  const expected = parseJson(form.expectedText);
  if (!expected.ok) return { ok: false, reason: "expectedJson" };
  let files: unknown = null;
  if (form.filesText.trim()) {
    const f = parseJson(form.filesText);
    if (!f.ok) return { ok: false, reason: "filesJson" };
    files = f.value;
  }
  const meta = { ...asObject(base?.input_meta), pr_title: form.prTitle, pr_description: form.prBody };
  const body = {
    name: form.name.trim(),
    expectation: form.expectation,
    input_diff: form.diff,
    input_files: files,
    input_meta: meta,
    expected_output: expected.value,
  };
  const problem = expectationProblem(form.expectation, expected.value);
  if (problem) return { ok: false, reason: "shape", message: problem };
  return { ok: true, body: body as EvalCaseBodyInput };
}

export const RUN_ON_SAVE_KEY = "devdigest.eval.runOnSave";

/** "Run on save" is remembered per viewer in localStorage only (never a server field). */
export function readRunOnSave(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(RUN_ON_SAVE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeRunOnSave(on: boolean): void {
  try {
    window.localStorage.setItem(RUN_ON_SAVE_KEY, on ? "1" : "0");
  } catch {
    /* storage unavailable — preference just isn't remembered */
  }
}
