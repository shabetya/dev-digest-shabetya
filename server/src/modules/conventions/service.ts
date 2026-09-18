import type { Container } from '../../platform/container.js';
import type { ConventionCandidate } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { RepoRepository } from '../repos/repository.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { ConventionsRepository, type InsertConvention } from './repository.js';
import { toConventionDto } from './helpers.js';
import { ConventionExtractionResponse, type ConventionCandidateInput } from './types.js';
import { CONVENTION_CONFIG_FILES, CONVENTION_SOURCE_SAMPLE_SIZE } from './constants.js';

/**
 * Conventions extraction. Sample selection is pure code (config files + the
 * repo-intel top-ranked source sample — no LLM involved). One cheap LLM call
 * proposes candidates; every candidate's evidence is then re-checked against
 * the actual repo files on disk, and anything that doesn't check out is
 * discarded BEFORE it's ever persisted or shown to the user.
 */
const SYSTEM_PROMPT = `You are analyzing a repository's config and source files to extract \
explicit, evidence-backed coding conventions — house rules a reviewer could \
enforce on future pull requests.

For each convention you find:
- "category" is a short kebab-case slug naming the rule's topic (e.g.
  "async-await", "error-handling", "naming", "imports", "state-management").
- "rule" states the convention directively, in one or two sentences (e.g.
  "Always use async/await instead of .then() chains.").
- "evidence_path" is the exact repo-relative path of ONE file (from the files
  given below) that demonstrates the rule being followed.
- "evidence_line_start" / "evidence_line_end" are the 1-based line numbers
  (from the numbered listing below) that show the pattern — a tight range,
  not the whole file.
- "evidence_snippet" is the literal source text of that line range.
- "confidence" (0–1) reflects how consistently this pattern recurs across the
  files you were given, not just how clean this one example looks.

Only report a convention you can point to concrete evidence for in the files
below. Do not invent a path, a line number, or a rule not actually
demonstrated. Prefer fewer, well-evidenced conventions over many speculative
ones. It is fine to return zero candidates.`;

export class ConventionsService {
  private repo: ConventionsRepository;
  private repos: RepoRepository;

  constructor(private container: Container) {
    this.repo = new ConventionsRepository(container.db);
    this.repos = new RepoRepository(container.db);
  }

  async list(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    await this.requireRepo(workspaceId, repoId);
    const rows = await this.repo.listByRepo(workspaceId, repoId);
    return rows.map(toConventionDto);
  }

  async setStatus(
    workspaceId: string,
    id: string,
    status: 'accepted' | 'rejected',
  ): Promise<ConventionCandidate> {
    const row = await this.repo.setStatus(workspaceId, id, status);
    if (!row) throw new NotFoundError('Convention candidate not found');
    return toConventionDto(row);
  }

  /**
   * Sample config files + top-ranked source files, ask the workspace's
   * `conventions` feature model for candidates, verify each candidate's
   * evidence against the real files, and persist the survivors.
   */
  async extract(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    await this.requireRepo(workspaceId, repoId);

    const sourceSamples = await this.container.repoIntel.getConventionSamples(
      repoId,
      CONVENTION_SOURCE_SAMPLE_SIZE,
    );
    const candidatePaths = [...CONVENTION_CONFIG_FILES, ...sourceSamples];
    const files = await this.container.repoIntel.getFileContents(repoId, candidatePaths);
    if (files.length === 0) return [];

    const choice = await resolveFeatureModel(this.container, workspaceId, 'conventions');
    const llm = await this.container.llm(choice.provider);

    const userMessage = files
      .map((f) => `### ${f.path}\n\`\`\`\n${numberLines(f.content)}\n\`\`\``)
      .join('\n\n');

    const result = await llm.completeStructured<ConventionExtractionResponse>({
      model: choice.model,
      schema: ConventionExtractionResponse,
      schemaName: 'ConventionExtraction',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      maxRetries: 2,
    });

    const verified = await this.verifyEvidence(repoId, result.data.candidates);
    if (verified.length === 0) return [];

    const rows = await this.repo.insertMany(
      verified.map(
        (c): InsertConvention => ({
          workspaceId,
          repoId,
          category: c.category,
          rule: c.rule,
          evidencePath: c.evidence_path,
          evidenceLineStart: c.evidence_line_start,
          evidenceLineEnd: c.evidence_line_end,
          evidenceSnippet: c.evidence_snippet,
          confidence: c.confidence,
        }),
      ),
    );
    return rows.map(toConventionDto);
  }

  private async requireRepo(workspaceId: string, repoId: string): Promise<void> {
    const repoRow = await this.repos.getById(workspaceId, repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');
  }

  /**
   * The code-based check: re-read each claimed file and discard any
   * candidate whose file doesn't exist in the clone, or whose line range
   * doesn't fit inside it. Runs after the LLM call, before persisting.
   */
  private async verifyEvidence(
    repoId: string,
    candidates: ConventionCandidateInput[],
  ): Promise<ConventionCandidateInput[]> {
    const paths = [...new Set(candidates.map((c) => c.evidence_path))];
    const files = await this.container.repoIntel.getFileContents(repoId, paths);
    const lineCounts = new Map(files.map((f) => [f.path, f.content.split('\n').length]));

    return candidates.filter((c) => {
      const total = lineCounts.get(c.evidence_path);
      if (total === undefined) return false; // file doesn't exist in the clone
      if (c.evidence_line_start < 1 || c.evidence_line_end < c.evidence_line_start) return false;
      return c.evidence_line_end <= total;
    });
  }
}

function numberLines(content: string): string {
  return content
    .split('\n')
    .map((line, i) => `${i + 1}: ${line}`)
    .join('\n');
}
