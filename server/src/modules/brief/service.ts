import { PrBrief, type PrIntentRecord } from '@devdigest/shared';
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
import { mapBlastResult } from '../_shared/blast-map.js';
import { classifyFile } from '../_shared/classify-file.js';
import { sanitizePathForHeading } from '../_shared/sanitize.js';
import { diffFromPrFiles } from '../reviews/diff-loader.js';
import { loadProjectContext } from '../reviews/project-context.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { BriefRepository } from './repository.js';
import { BriefLlmResponse, type BriefLogger } from './types.js';
import {
  buildMissing,
  describeMissingInputs,
  formatFileInputs,
  hunkRangesByFile,
  isEmptyBrief,
  validateBrief,
  type BriefFileInput,
} from './helpers.js';
import {
  BRIEF_PROMPT,
  BRIEF_REASONS,
  BRIEF_SCHEMA_NAME,
  LLM_MAX_OUTPUT_TOKENS,
  LLM_MAX_RETRIES,
  LLM_TIMEOUT_MS,
  MAX_CALLER_FILES,
  MAX_PROMPT_FILES,
  MAX_PR_BODY_CHARS,
  MAX_SPECS_CHARS,
} from './constants.js';

/** Process-local per-PR generation lock (AC-4b). Released in `finally`. */
const inFlight = new Set<string>();

/** Language of generated prose; no per-workspace setting exists yet. */
const BRIEF_LANGUAGE = 'English';

/**
 * PR "Why + Risk" brief (SPEC-03). Gathers already-computed inputs (each in its
 * own try/catch so a missing one only lands in `missing[]`), wraps every piece
 * of PR-derived text as untrusted, makes exactly ONE structured LLM call, then
 * validates the output against the PR's real files/hunks before persisting. A
 * failure at any step leaves the previous brief untouched.
 */
export class BriefService {
  private repo: BriefRepository;

  constructor(
    private container: Container,
    private log?: BriefLogger,
  ) {
    this.repo = new BriefRepository(container.db, log);
  }

  /** Stored brief or null (AC-1, AC-2). 404 when the PR isn't in the workspace. */
  async get(workspaceId: string, prId: string): Promise<PrBrief | null> {
    await this.requirePull(workspaceId, prId);
    return this.repo.getByPrId(prId);
  }

  async generate(workspaceId: string, prId: string): Promise<PrBrief> {
    const pull = await this.requirePull(workspaceId, prId);

    if (inFlight.has(prId)) {
      throw new ConflictError('Brief generation already in progress for this PR', {
        reason: BRIEF_REASONS.generationInProgress,
      });
    }
    inFlight.add(prId);
    try {
      const prFiles = await this.container.reviewRepo.getPrFiles(prId);
      if (prFiles.length === 0) {
        throw new ValidationError('The PR has no changed files', { reason: BRIEF_REASONS.noFiles });
      }
      const changedPaths = prFiles.map((f) => f.path);

      // Hunk ranges come from the same pr_files patches the client renders.
      const rangesByFile = hunkRangesByFile(await diffFromPrFiles(this.container.reviewRepo, prId));
      const fileInputs: BriefFileInput[] = prFiles.map((f) => ({
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
        role: classifyFile(f.path),
        ranges: rangesByFile.get(f.path) ?? [],
      }));

      const [intent, blast, specs] = await Promise.all([
        this.gatherIntent(prId),
        this.gatherBlast(pull.repoId, changedPaths),
        this.gatherSpecs(workspaceId, pull.repoId, prId),
      ]);
      const missing = buildMissing({
        intent: intent !== null,
        blast: blast !== null,
        specs: specs !== null,
      });

      const prompt = [
        `## PR title\n${wrapUntrusted('pr-title', pull.title)}`,
        pull.body
          ? `## PR description\n${wrapUntrusted('pr-description', pull.body.slice(0, MAX_PR_BODY_CHARS))}`
          : '## PR description\n(none provided)',
        intent ? `## Intent\n${wrapUntrusted('intent', intent)}` : '',
        blast ? `## Blast radius\n${wrapUntrusted('blast-radius', blast)}` : '',
        specs ? `## Attached project specs\n${wrapUntrusted('project-specs', specs)}` : '',
        `## Changed files (paths, line changes, role, hunk line ranges; no code)\n${wrapUntrusted('changed-files', formatFileInputs(fileInputs, MAX_PROMPT_FILES))}`,
        `## ${describeMissingInputs(missing)}`,
      ]
        .filter((b) => b.length > 0)
        .join('\n\n');

      const { draft, model, tokensIn, tokensOut, costUsd } = await this.draft(workspaceId, prompt);

      // Validate BEFORE persisting: hallucinated files/lines never reach the DB.
      const validated = validateBrief(draft, changedPaths, rangesByFile);
      if (isEmptyBrief(validated)) {
        throw new ExternalServiceError('The model returned no usable brief', {
          reason: BRIEF_REASONS.generationFailed,
        });
      }

      const hasUsage = tokensIn > 0 || tokensOut > 0 || costUsd !== null;
      const checked = PrBrief.safeParse({
        ...validated,
        missing,
        generated_at: new Date().toISOString(),
        generated_for_sha: pull.headSha,
        model,
        usage: hasUsage
          ? { prompt_tokens: tokensIn, completion_tokens: tokensOut, cost_usd: costUsd }
          : null,
      });
      if (!checked.success) {
        throw new ExternalServiceError('Generated brief failed validation', {
          reason: BRIEF_REASONS.generationFailed,
        });
      }

      await this.repo.upsert(prId, checked.data);
      // Names, sizes, model and cost only: never PR text, specs or model prose.
      this.log?.info(
        {
          prId,
          model,
          tokensIn,
          tokensOut,
          costUsd,
          missing,
          files: prFiles.length,
          risksFromModel: draft.risks.length,
          risksKept: checked.data.risks.length,
          focusFromModel: draft.review_focus.length,
          focusKept: checked.data.review_focus.length,
        },
        'pr brief generated',
      );
      return checked.data;
    } finally {
      inFlight.delete(prId);
    }
  }

  private async requirePull(workspaceId: string, prId: string) {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    return pull;
  }

  /** Persisted Intent only; never triggers an Intent LLM call. null = unavailable. */
  private async gatherIntent(prId: string): Promise<string | null> {
    try {
      const rec: PrIntentRecord | undefined = await this.container.reviewRepo.getIntent(prId);
      if (!rec) return null;
      const lines = [`summary: ${rec.summary}`];
      if (rec.in_scope.length) lines.push(`in scope: ${rec.in_scope.join('; ')}`);
      if (rec.out_of_scope.length) lines.push(`out of scope: ${rec.out_of_scope.join('; ')}`);
      return lines.join('\n');
    } catch (err) {
      this.log?.warn({ prId, err: (err as Error).message }, 'brief: intent unavailable');
      return null;
    }
  }

  /** Blast summary + capped distinct calling files. null = unavailable/empty/degraded. */
  private async gatherBlast(repoId: string, changedPaths: string[]): Promise<string | null> {
    if (!this.container.config.repoIntelEnabled) return null;
    try {
      const result = await this.container.repoIntel.getBlastRadius(repoId, changedPaths);
      if (result.degraded) return null;
      if (result.changedSymbols.length === 0 && result.callers.length === 0) return null;
      const summary = mapBlastResult(result, []).summary;
      const callerFiles = [...new Set(result.callers.map((c) => c.file))].slice(0, MAX_CALLER_FILES);
      const list = callerFiles.map((f) => `- ${sanitizePathForHeading(f)}`).join('\n');
      return `${summary}\nCalling files:\n${list || '(none)'}`;
    } catch (err) {
      this.log?.warn({ repoId, err: (err as Error).message }, 'brief: blast radius unavailable');
      return null;
    }
  }

  /** Attached specs of all enabled agents in the workspace. Best-effort; null = none. */
  private async gatherSpecs(
    workspaceId: string,
    repoId: string,
    prId: string,
  ): Promise<string | null> {
    try {
      const paths = await this.container.contextRepo.workspaceEffectivePaths(workspaceId);
      if (paths.length === 0) return null;
      const repoRow = await this.container.reviewRepo.getRepo(repoId);
      if (!repoRow) return null;
      const ctx = await loadProjectContext(this.container, repoRow, paths, {
        info: (msg) => this.log?.info({ prId }, msg),
      });
      if (ctx.specs.length === 0) return null;
      return ctx.specs.join('\n\n').slice(0, MAX_SPECS_CHARS);
    } catch (err) {
      this.log?.warn({ prId, err: (err as Error).message }, 'brief: project specs unavailable');
      return null;
    }
  }

  /** Exactly one `completeStructured` call; failures mapped to machine-readable reasons. */
  private async draft(workspaceId: string, userMessage: string) {
    let llm;
    let model: string;
    let system: string;
    try {
      const choice = await resolveFeatureModel(this.container, workspaceId, 'risk_brief');
      model = choice.model;
      llm = await this.container.llm(choice.provider);
      system = await renderPrompt(BRIEF_PROMPT, { language: BRIEF_LANGUAGE });
    } catch (err) {
      throw new ExternalServiceError('No LLM provider is available for the PR brief', {
        reason: BRIEF_REASONS.llmUnavailable,
        cause: err instanceof AppError ? err.code : 'llm_error',
      });
    }
    try {
      const result = await llm.completeStructured<BriefLlmResponse>({
        model,
        schema: BriefLlmResponse,
        schemaName: BRIEF_SCHEMA_NAME,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userMessage },
        ],
        maxTokens: LLM_MAX_OUTPUT_TOKENS,
        timeoutMs: LLM_TIMEOUT_MS,
        maxRetries: LLM_MAX_RETRIES,
      });
      return {
        draft: result.data,
        model: result.model,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd: result.costUsd,
      };
    } catch (err) {
      throw new ExternalServiceError('The LLM provider failed or returned an invalid brief', {
        reason: BRIEF_REASONS.generationFailed,
        cause: err instanceof AppError ? err.code : 'llm_error',
      });
    }
  }
}
