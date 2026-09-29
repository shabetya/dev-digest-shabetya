import { ONBOARDING_VERSION, Onboarding } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import {
  AppError,
  ConflictError,
  ExternalServiceError,
  NotFoundError,
  ValidationError,
} from '../../platform/errors.js';
import { renderPrompt } from '../../platform/prompts.js';
import { wrapUntrusted } from '../../platform/prompt.js';
import { createRepoFiles, type RepoFiles } from '../../adapters/git/repo-path.js';
import { RepoRepository } from '../repos/repository.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { OnboardingRepository, type OnboardingLogger } from './repository.js';
import { OnboardingLlmResponse } from './types.js';
import {
  buildCriticalPaths,
  countDistinctCallerFiles,
  findUntested,
  fitToBudget,
  keepExistingPaths,
  sanitizeDiagram,
  sanitizeFirstTasks,
  sanitizeHeadingPath,
  sanitizeReadingPath,
  sanitizeRunSteps,
  scanTodos,
  stripMarkdownLinks,
  stripUnverifiedPathCode,
} from './helpers.js';
import {
  CRITICAL_PATH_LIMIT,
  GROUNDING_TOKEN_BUDGET,
  KEY_FILES,
  KEY_FILE_MAX_BYTES,
  LLM_MAX_OUTPUT_TOKENS,
  LLM_MAX_RETRIES,
  LLM_TIMEOUT_MS,
  ONBOARDING_LANGUAGE,
  ONBOARDING_PROMPT,
  ONBOARDING_REASONS,
  ONBOARDING_SCHEMA_NAME,
  REPO_MAP_TOKEN_BUDGET,
  TODO_MAX_HITS,
  TOP_FILES_LIMIT,
  UNTESTED_MAX_FILES,
} from './constants.js';

/** Process-local per-repo generation lock (AC-16). Released in `finally`. */
const inFlight = new Set<string>();

/**
 * Onboarding tour. Grounding comes from repo-intel + key clone files (all
 * wrapped as untrusted); one synchronous structured LLM call drafts the tour;
 * every path / script / command is then re-verified against the clone and the
 * result is persisted only if the whole pipeline succeeded (AC-8: a failure at
 * any step leaves the previous tour untouched). Nothing generated is executed.
 */
export class OnboardingService {
  private repos: RepoRepository;
  private repo: OnboardingRepository;

  constructor(
    private container: Container,
    private log?: OnboardingLogger,
  ) {
    this.repos = new RepoRepository(container.db);
    this.repo = new OnboardingRepository(container.db, log);
  }

  /** Current tour or null (AC-6, AC-17). 404 when the repo isn't in the workspace. */
  async get(workspaceId: string, repoId: string): Promise<Onboarding | null> {
    await this.requireRepo(workspaceId, repoId);
    return this.repo.getByRepoId(repoId);
  }

  async generate(workspaceId: string, repoId: string): Promise<Onboarding> {
    const row = await this.requireRepo(workspaceId, repoId);

    if (inFlight.has(repoId)) {
      throw new ConflictError('Onboarding generation already in progress for this repo', {
        reason: ONBOARDING_REASONS.generationInProgress,
      });
    }
    inFlight.add(repoId);
    try {
      const files = row.clonePath ? await createRepoFiles(row.clonePath) : null;
      if (!files) {
        throw new ValidationError('Repo has no clone on disk', {
          reason: ONBOARDING_REASONS.noClone,
        });
      }

      const state = await this.container.repoIntel.getIndexState(repoId);
      if (!this.container.config.repoIntelEnabled || state.status !== 'full' || state.degraded) {
        throw new ValidationError('The repo index is unavailable; index the repo first', {
          reason: ONBOARDING_REASONS.indexUnavailable,
        });
      }

      const grounding = await this.gatherGrounding(repoId, row.fullName, files, state.filesIndexed);
      const draft = await this.draft(workspaceId, grounding.prompt);

      // Validate BEFORE persisting: hallucinated paths/commands never reach the DB.
      const diagram = await sanitizeDiagram(draft.architecture, files);
      this.log?.info(
        {
          repoId,
          nodesFromModel: draft.architecture.nodes.length,
          edgesFromModel: draft.architecture.edges.length,
          nodesKept: diagram.nodes.length,
          edgesKept: diagram.edges.length,
        },
        'onboarding diagram sanitized',
      );
      const body = {
        version: ONBOARDING_VERSION,
        index_files: state.filesIndexed,
        sections: {
          architecture: {
            prose: await stripUnverifiedPathCode(stripMarkdownLinks(draft.architecture.prose), files),
            nodes: diagram.nodes,
            edges: diagram.edges,
          },
          critical_paths: buildCriticalPaths(grounding.criticalSeeds, draft.critical_paths),
          run_locally: await sanitizeRunSteps(draft.run_locally, files),
          reading_path: await sanitizeReadingPath(draft.reading_path, files),
          first_tasks: await sanitizeFirstTasks(draft.first_tasks, files),
        },
      } as const;

      // Contract check with a placeholder timestamp (the DB clock sets the real one).
      const checked = Onboarding.safeParse({ ...body, generated_at: new Date().toISOString() });
      if (!checked.success) {
        throw new ExternalServiceError('Generated onboarding tour failed validation', {
          reason: ONBOARDING_REASONS.llmUnavailable,
        });
      }

      const { generated_at: _ignored, ...persisted } = checked.data;
      await this.repo.upsert(repoId, persisted);
      const saved = await this.repo.getByRepoId(repoId);
      if (!saved) throw new Error('onboarding tour vanished after upsert');
      return saved;
    } finally {
      inFlight.delete(repoId);
    }
  }

  private async requireRepo(workspaceId: string, repoId: string) {
    const row = await this.repos.getById(workspaceId, repoId);
    if (!row) throw new NotFoundError('Repo not found');
    return row;
  }

  private async draft(workspaceId: string, userMessage: string): Promise<OnboardingLlmResponse> {
    try {
      const choice = await resolveFeatureModel(this.container, workspaceId, 'onboarding');
      const llm = await this.container.llm(choice.provider);
      const system = await renderPrompt(ONBOARDING_PROMPT, { language: ONBOARDING_LANGUAGE });
      const result = await llm.completeStructured<OnboardingLlmResponse>({
        model: choice.model,
        schema: OnboardingLlmResponse,
        schemaName: ONBOARDING_SCHEMA_NAME,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userMessage },
        ],
        maxTokens: LLM_MAX_OUTPUT_TOKENS,
        timeoutMs: LLM_TIMEOUT_MS,
        maxRetries: LLM_MAX_RETRIES,
      });
      return result.data;
    } catch (err) {
      throw new ExternalServiceError('The LLM provider is unavailable or returned an invalid tour', {
        reason: ONBOARDING_REASONS.llmUnavailable,
        cause: err instanceof AppError ? err.code : 'llm_error',
      });
    }
  }

  /** Deterministic grounding: repo-intel facts + key clone files, all wrapped as untrusted. */
  private async gatherGrounding(
    repoId: string,
    fullName: string,
    files: RepoFiles,
    indexFiles: number,
  ): Promise<{ prompt: string; criticalSeeds: { path: string; callers: number | null }[] }> {
    const intel = this.container.repoIntel;
    const [repoMap, topRaw, chains] = await Promise.all([
      intel.getRepoMap(repoId, REPO_MAP_TOKEN_BUDGET),
      intel.getTopFilesByRank(repoId, TOP_FILES_LIMIT),
      intel.getCriticalPaths(repoId),
    ]);
    const topFiles = await keepExistingPaths(files, topRaw);
    const seedPaths = (
      await keepExistingPaths(files, [...chains.flat(), ...topFiles])
    ).slice(0, CRITICAL_PATH_LIMIT);

    const criticalSeeds: { path: string; callers: number | null }[] = [];
    for (const path of seedPaths) {
      const blast = await intel.getBlastRadius(repoId, [path]);
      criticalSeeds.push({ path, callers: countDistinctCallerFiles(blast, path) });
    }

    const keyFiles: { path: string; content: string }[] = [];
    for (const path of KEY_FILES) {
      const content = await files.read(path, KEY_FILE_MAX_BYTES);
      if (content !== null) keyFiles.push({ path, content });
    }
    const sourceFiles: { path: string; content: string }[] = [];
    for (const path of topFiles) {
      const content = await files.read(path, KEY_FILE_MAX_BYTES);
      if (content !== null) sourceFiles.push({ path, content });
    }
    const todos = scanTodos(sourceFiles, TODO_MAX_HITS);
    const untested = await findUntested(topFiles, files, UNTESTED_MAX_FILES);

    const list = (paths: string[]) => paths.map((p) => `- ${sanitizeHeadingPath(p)}`).join('\n');
    const blocks: string[] = [
      `## FACTS\nrepo: ${sanitizeHeadingPath(fullName)}\nindexed files: ${indexFiles}`,
      `## Critical files (use ONLY these for critical_paths)\n${wrapUntrusted('critical-files', list(criticalSeeds.map((s) => s.path)))}`,
      `## Top files by importance rank\n${wrapUntrusted('top-files', list(topFiles))}`,
      ...keyFiles.map(
        (f) => `## Key file: ${sanitizeHeadingPath(f.path)}\n${wrapUntrusted('key-file', f.content)}`,
      ),
      repoMap.text ? `## Repo map\n${wrapUntrusted('repo-map', repoMap.text)}` : '',
      todos.length ? `## TODO/FIXME occurrences\n${wrapUntrusted('todo-signals', todos.join('\n'))}` : '',
      untested.length
        ? `## Files without a sibling test\n${wrapUntrusted('untested-files', list(untested))}`
        : '',
    ].filter((b) => b.length > 0);

    const prompt = fitToBudget(blocks, GROUNDING_TOKEN_BUDGET, (s) =>
      this.container.tokenizer.count(s),
    ).join('\n\n');
    return { prompt, criticalSeeds };
  }
}
