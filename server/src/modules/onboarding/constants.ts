/** Constants for the onboarding-tour module (SPEC-02). */

/** Machine-readable `error.details.reason` values (AC-15, AC-16). */
export const ONBOARDING_REASONS = {
  noClone: 'no_clone',
  indexUnavailable: 'index_unavailable',
  llmUnavailable: 'llm_unavailable',
  generationInProgress: 'generation_in_progress',
} as const;
export type OnboardingReason = (typeof ONBOARDING_REASONS)[keyof typeof ONBOARDING_REASONS];

/** Prompt template + structured-output schema name. */
export const ONBOARDING_PROMPT = 'onboarding.system.md';
export const ONBOARDING_SCHEMA_NAME = 'OnboardingTour';
/** No per-workspace language setting exists yet; matches the prompt's `{{language}}`. */
export const ONBOARDING_LANGUAGE = 'English';

/** LLM call limits. */
export const LLM_TIMEOUT_MS = 120_000;
export const LLM_MAX_RETRIES = 2;
export const LLM_MAX_OUTPUT_TOKENS = 6_000;

/** Grounding input budget (tokens, via container.tokenizer). */
export const GROUNDING_TOKEN_BUDGET = 24_000;
export const REPO_MAP_TOKEN_BUDGET = 6_000;
export const KEY_FILE_MAX_BYTES = 24 * 1024;
export const TODO_MAX_HITS = 25;
export const UNTESTED_MAX_FILES = 15;

/** Critical-path / reading-path seeding. */
export const CRITICAL_PATH_LIMIT = 8;
export const TOP_FILES_LIMIT = 30;

/** Output limits (mirror the contract). */
export const MAX_DIAGRAM_NODES = 12;
export const MAX_DIAGRAM_EDGES = 48;
export const MAX_COMMAND_LENGTH = 300;
export const MAX_FIRST_TASKS = 5;
export const MAX_TASK_FILES = 8;
export const MAX_READING_PATH = 10;

/** Fixed list of key files gathered for grounding; missing ones are skipped. */
export const KEY_FILES = [
  'README.md',
  'readme.md',
  'README',
  'package.json',
  'pyproject.toml',
  'Cargo.toml',
  'go.mod',
  '.env.example',
  '.env.sample',
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
  'Makefile',
  'CONTRIBUTING.md',
] as const;

/** Source extensions: scanned for TODO/FIXME; also used to decide "looks like a path". */
export const SOURCE_EXTENSIONS = [
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'go', 'rs', 'java', 'kt', 'rb', 'php', 'cs',
  'swift', 'json', 'md', 'yml', 'yaml', 'toml', 'sql', 'sh', 'css', 'html',
] as const;

/** Package-manager subcommands that are NOT scripts (pnpm/yarn bare form). */
export const PKG_MANAGER_BUILTINS: ReadonlySet<string> = new Set([
  'install', 'i', 'add', 'remove', 'rm', 'uninstall', 'update', 'up', 'upgrade', 'dlx', 'exec',
  'init', 'create', 'link', 'unlink', 'list', 'ls', 'outdated', 'audit', 'why', 'store', 'env',
  'config', 'cache', 'help', 'version', 'publish', 'pack', 'patch', 'import', 'prune', 'rebuild',
  'fetch', 'setup', 'dedupe', 'licenses', 'global', 'workspace', 'workspaces', 'info', 'set',
  'node', 'bin', 'root', 'deploy', 'doctor', 'unplug', 'ci', 'login', 'logout', 'whoami',
  'approve-builds', 'self-update', 'rebuild', 'run',
]);
