/** Constants for the PR-brief module (SPEC-03). */

/** Machine-readable `error.details.reason` values (AC-4, AC-4b). Mirrors `BriefErrorReason`. */
export const BRIEF_REASONS = {
  llmUnavailable: 'llm_unavailable',
  noFiles: 'no_files',
  generationFailed: 'generation_failed',
  generationInProgress: 'generation_in_progress',
} as const;

/** Prompt template + structured-output schema name. */
export const BRIEF_PROMPT = 'risk-brief.system.md';
export const BRIEF_SCHEMA_NAME = 'PrRiskBrief';

/** LLM call limits. */
export const LLM_TIMEOUT_MS = 90_000;
export const LLM_MAX_RETRIES = 2;
export const LLM_MAX_OUTPUT_TOKENS = 3_000;

/** Output limits (AC-10). */
export const MAX_RISKS = 8;
export const MAX_REVIEW_FOCUS = 5;

/** String caps applied to model output before persisting. */
export const MAX_SUMMARY_CHARS = 1_200;
export const MAX_TITLE_CHARS = 200;
export const MAX_EXPLANATION_CHARS = 800;
export const MAX_REASON_CHARS = 300;
export const MAX_KIND_CHARS = 40;

/** Prompt input caps. */
export const MAX_CALLER_FILES = 20;
export const MAX_PROMPT_FILES = 120;
export const MAX_HUNK_RANGES_PER_FILE = 8;
export const MAX_PR_BODY_CHARS = 4_000;
export const MAX_SPECS_CHARS = 24_000;
