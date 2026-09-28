import { z } from 'zod';
import type { Config } from './config.js';
import { apiError, apiUnreachable } from './errors.js';
import {
  ActiveRunSchema,
  AgentSchema,
  BlastRadiusSchema,
  ConventionCandidateSchema,
  PrMetaSchema,
  RepoSchema,
  ReviewRecordSchema,
  ReviewRunResponseSchema,
  RunSummarySchema,
  type ActiveRun,
  type Agent,
  type BlastRadius,
  type ConventionCandidate,
  type PrMeta,
  type Repo,
  type ReviewRecord,
  type ReviewRunResponse,
  type RunSummary,
} from './api-types.js';

/**
 * Thin fetch wrapper around the already-running `@devdigest/api` server.
 * Pure HTTP client — no DB/DI access. Every method validates the response
 * against the hand-copied schemas in `api-types.ts` before returning it.
 */
export class ApiClient {
  constructor(private readonly config: Config) {}

  private async request<T>(
    method: string,
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.config.apiUrl}${path}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: body !== undefined ? { 'content-type': 'application/json' } : {},
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw apiUnreachable(this.config.apiUrl, err);
    }
    const text = await res.text();
    if (!res.ok) {
      throw apiError(method, path, res.status, text);
    }
    const json = text.length > 0 ? JSON.parse(text) : undefined;
    return schema.parse(json);
  }

  /** Fail fast at startup if the API isn't reachable, rather than hanging on
   *  the first tool call. */
  async checkConnectivity(): Promise<void> {
    let res: Response;
    try {
      res = await fetch(`${this.config.apiUrl}/repos`);
    } catch (err) {
      throw apiUnreachable(this.config.apiUrl, err);
    }
    if (!res.ok) {
      throw apiUnreachable(this.config.apiUrl, new Error(`HTTP ${res.status}`));
    }
  }

  listAgents(): Promise<Agent[]> {
    return this.request('GET', '/agents', z.array(AgentSchema));
  }

  getAgent(id: string): Promise<Agent> {
    return this.request('GET', `/agents/${id}`, AgentSchema);
  }

  listRepos(): Promise<Repo[]> {
    return this.request('GET', '/repos', z.array(RepoSchema));
  }

  listPulls(repoId: string): Promise<PrMeta[]> {
    return this.request('GET', `/repos/${repoId}/pulls`, z.array(PrMetaSchema));
  }

  getPull(prId: string): Promise<PrMeta> {
    return this.request('GET', `/pulls/${prId}`, PrMetaSchema);
  }

  getConventions(repoId: string): Promise<ConventionCandidate[]> {
    return this.request(
      'GET',
      `/repos/${repoId}/conventions`,
      z.array(ConventionCandidateSchema),
    );
  }

  triggerReview(prId: string, agentId: string): Promise<ReviewRunResponse> {
    return this.request('POST', `/pulls/${prId}/review`, ReviewRunResponseSchema, { agentId });
  }

  getActiveRuns(prId: string): Promise<ActiveRun[]> {
    return this.request('GET', `/pulls/${prId}/runs/active`, z.array(ActiveRunSchema));
  }

  getRuns(prId: string): Promise<RunSummary[]> {
    return this.request('GET', `/pulls/${prId}/runs`, z.array(RunSummarySchema));
  }

  getReviews(prId: string): Promise<ReviewRecord[]> {
    return this.request('GET', `/pulls/${prId}/reviews`, z.array(ReviewRecordSchema));
  }

  getBlastRadius(prId: string): Promise<BlastRadius> {
    return this.request('GET', `/pulls/${prId}/blast`, BlastRadiusSchema);
  }
}
