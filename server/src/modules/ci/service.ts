import AdmZip from 'adm-zip';
import type { Container } from '../../platform/container.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { toAgentDto } from '../agents/helpers.js';
import type { CiExport, CiExportInput, CiFailOn, CiInstallation, CiRun } from '@devdigest/shared';
import { CiResultArtifact } from '@devdigest/shared';
import { CiRepository } from './repository.js';
import { buildCiFiles, resolveDevdigestHeadSha } from './templates.js';
import { deriveRunStatus, slugify, toCiInstallationDto, toCiRunDto } from './helpers.js';

export interface RefreshResult {
  ingested: number;
  rejections: { repo: string; runId: number; reason: string }[];
}

/**
 * CI module service — the Export Wizard's file generation + Install (PR/zip)
 * action, and the Refresh-ingestion pull (AC-15/AC-16). Neither
 * `ci_installations` nor `ci_runs` carries `workspace_id`; every method here
 * either resolves the agent through `agentsRepo.getById(workspaceId, …)`
 * first, or delegates to a `CiRepository` method that itself joins through
 * `agents` (onion-architecture: "every read by id carries the tenant").
 */
export class CiService {
  private repo: CiRepository;

  constructor(private container: Container) {
    this.repo = new CiRepository(container.db);
  }

  /** AC-1–AC-8, AC-20, AC-21: generate the file set and (optionally) open the Install PR. */
  async exportCi(
    workspaceId: string,
    agentId: string,
    input: CiExportInput,
  ): Promise<CiExport | undefined> {
    const agentRow = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agentRow) return undefined;
    const agent = toAgentDto(agentRow);

    const linked = await this.container.agentsRepo.linkedSkills(agentId);
    const taken = new Set<string>();
    const skills = linked.map((l) => ({
      slug: slugify(l.skill.name, taken),
      name: l.skill.name,
      body: l.skill.body,
    }));

    const agentSlug = slugify(agent.name);
    const files = buildCiFiles({
      agent,
      agentSlug,
      skills,
      input,
      devdigestRepo: this.container.config.devdigestRepo,
      pinnedSha: resolveDevdigestHeadSha(),
    });

    let prUrl: string | null = null;
    let installationRow = null;
    if (input.action === 'open_pr') {
      const [owner, name] = input.repo.split('/');
      if (!owner || !name) throw new ValidationError('repo must be in "owner/name" form');
      const repoRef = { owner, name };
      const gh = await this.container.github();

      // AC-7: force-update the branch (idempotent re-export), reuse an
      // existing open PR for it rather than open a duplicate.
      await gh.commitFiles(repoRef, {
        branch: 'devdigest/ci',
        base: input.base,
        message: 'Add DevDigest CI review',
        files: files.map((f) => ({ path: f.path, contents: f.contents })),
      });
      const existing = await gh.findOpenPr(repoRef, 'devdigest/ci');
      prUrl = existing
        ? existing.url
        : (
            await gh.openPullRequest(repoRef, {
              title: 'Add DevDigest CI review',
              head: 'devdigest/ci',
              base: input.base,
              body: `Adds a GitHub Actions workflow that runs the "${agent.name}" DevDigest agent on every pull request.`,
            })
          ).url;

      // Only now is the repo actually "installed" — one row per (agent,
      // repo), upsert, never duplicate. A "files"-only preview call (step
      // navigation, Configure toggles) must NOT create this row: doing so
      // used to make the CI tab show a repo as installed before Install was
      // ever clicked (and even if `open_pr` above later failed, e.g. a PAT
      // without write access to this repo).
      installationRow = await this.repo.upsertInstallation(agentId, input.repo, input.target);
    }

    return {
      installation: installationRow ? toCiInstallationDto(installationRow) : null,
      files,
      pr_url: prUrl,
    };
  }

  /** AC-18: an agent's CI tab — its tracked installations, scoped via the join. */
  async listInstallationsForAgent(
    workspaceId: string,
    agentId: string,
  ): Promise<CiInstallation[] | undefined> {
    const agentRow = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agentRow) return undefined;
    const rows = await this.repo.listInstallationsForAgent(workspaceId, agentId);
    return rows.map(toCiInstallationDto);
  }

  /** AC-18: an agent's CI runs, scoped via the join. */
  async listRunsForAgent(workspaceId: string, agentId: string): Promise<CiRun[] | undefined> {
    const agentRow = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agentRow) return undefined;
    const rows = await this.repo.listRunsForAgent(workspaceId, agentId);
    return rows.map((r) => toCiRunDto(r.run, r.agentName));
  }

  /** AC-17: the global CI Runs page. */
  async listRunsForWorkspace(
    workspaceId: string,
    filters: { agentId?: string; repo?: string; status?: string } = {},
  ): Promise<CiRun[]> {
    const rows = await this.repo.listRunsForWorkspace(workspaceId, filters);
    return rows.map((r) => toCiRunDto(r.run, r.agentName));
  }

  /**
   * AC-15/AC-16: pull-on-refresh ingestion (the `PollingService.pollRepo`
   * SHAPE — manual trigger, no webhook — copied, not called; CI runs live in
   * a different table with a different dedupe key). `agentId` narrows to one
   * agent's installations (the CI tab's Refresh); omitted, it scans every
   * installation in the workspace (the global CI Runs page's Refresh).
   */
  async refreshRuns(workspaceId: string, agentId?: string): Promise<RefreshResult> {
    if (agentId) {
      const agentRow = await this.container.agentsRepo.getById(workspaceId, agentId);
      if (!agentRow) throw new NotFoundError('Agent not found');
    }
    const installations = await this.repo.listInstallationsForWorkspace(workspaceId, agentId);
    const gh = await this.container.github();
    const rejections: RefreshResult['rejections'] = [];
    let ingested = 0;

    for (const installation of installations) {
      const [owner, name] = installation.repo.split('/');
      if (!owner || !name) continue;
      const repoRef = { owner, name };

      const runs = await gh.listWorkflowRuns(repoRef, { perPage: 30 }).catch(() => []);
      for (const wfRun of runs) {
        if (wfRun.event !== 'pull_request') continue;
        const already = await this.repo.hasRunForGithubRunId(installation.id, String(wfRun.id));
        if (already) continue;

        const artifacts = await gh
          .listWorkflowRunArtifacts(repoRef, wfRun.id)
          .catch(() => []);
        const artifactMeta = artifacts.find((a) => a.name === 'devdigest-result' && !a.expired);
        // Nothing uploaded (crashed before the upload step, or expired) —
        // the spec's own edge case says this is NOT surfaced as an error.
        if (!artifactMeta) continue;

        let json: unknown;
        try {
          const zip = new AdmZip(await gh.downloadArtifact(repoRef, artifactMeta.id));
          const entry = zip.getEntries().find((e) => e.entryName === 'devdigest-result.json');
          if (!entry) {
            rejections.push({ repo: installation.repo, runId: wfRun.id, reason: 'artifact zip has no devdigest-result.json' });
            continue;
          }
          json = JSON.parse(entry.getData().toString('utf8'));
        } catch (err) {
          rejections.push({
            repo: installation.repo,
            runId: wfRun.id,
            reason: `could not read artifact: ${err instanceof Error ? err.message : String(err)}`,
          });
          continue;
        }

        // AC-16: the artifact is a cross-trust-boundary document — validate
        // its SHAPE before trusting any value from it.
        const parsed = CiResultArtifact.safeParse(json);
        if (!parsed.success) {
          rejections.push({
            repo: installation.repo,
            runId: wfRun.id,
            reason: `CiResultArtifact schema validation failed: ${parsed.error.message}`,
          });
          continue;
        }
        const artifact = parsed.data;

        // AC-15: the PR number comes from the WORKFLOW RUN's own
        // GitHub-reported `pull_requests` (trusted, from `listWorkflowRuns`)
        // — never from the untrusted artifact's own `pr_number` alone — then
        // is cross-checked against a REAL PR on the repo.
        const prNumber = wfRun.pullRequests[0] ?? artifact.pr_number ?? null;
        if (prNumber == null) {
          rejections.push({ repo: installation.repo, runId: wfRun.id, reason: 'no associated PR number' });
          continue;
        }
        const realPr = await gh.getPullRequest(repoRef, prNumber).catch(() => null);
        if (!realPr) {
          rejections.push({
            repo: installation.repo,
            runId: wfRun.id,
            reason: `PR #${prNumber} does not resolve on ${installation.repo}`,
          });
          continue;
        }

        const agentRow = await this.container.agentsRepo.getById(workspaceId, installation.agentId);
        const failOn: CiFailOn = (agentRow?.ciFailOn as CiFailOn) ?? 'critical';
        const status = deriveRunStatus(
          { critical: artifact.critical ?? 0, warning: artifact.warning ?? 0, suggestion: artifact.suggestion ?? 0 },
          failOn,
        );

        await this.repo.upsertRunFromArtifact({
          ciInstallationId: installation.id,
          prNumber,
          ranAt: new Date(wfRun.createdAt),
          status,
          findingsCount: artifact.findings_count,
          costUsd: artifact.cost_usd,
          githubUrl: wfRun.htmlUrl,
          source: 'gha',
          commitSha: wfRun.headSha,
          githubRunId: String(wfRun.id),
          durationMs: artifact.duration_ms ?? null,
        });
        ingested++;
      }
    }

    return { ingested, rejections };
  }
}
