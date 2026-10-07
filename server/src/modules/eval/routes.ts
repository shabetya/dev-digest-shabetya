import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  EvalCaseBody,
  EvalCaseCreated,
  EvalCasePatch,
  EvalCaseSummary,
  EvalCompare,
  EvalDashboard,
  EvalRunResult,
  EvalSuiteRun,
  EvalSuiteRunDetail,
  EvalWorkspaceDashboard,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { EvalService } from './service.js';
import { EVAL_RUN_RATE_LIMIT } from './constants.js';

/**
 * eval module (SPEC-04).
 *   POST   /findings/:id/eval-case        → turn an accepted/dismissed finding into a case (201 new / 200 existing)
 *   GET    /agents/:id/eval-cases         → the agent's cases + last-run summary
 *   POST   /agents/:id/eval-cases         → create a case by hand
 *   PATCH  /eval-cases/:id                → edit a case
 *   DELETE /eval-cases/:id                → delete a case
 *   POST   /eval-cases/:id/run            → run ONE case on the agent's current config (rate-limited, LLM)
 *   POST   /agents/:id/eval-runs          → start a suite run (202; rate-limited, LLM)
 *   GET    /agents/:id/eval-runs          → suite-run history, newest first
 *   GET    /eval-suite-runs/compare?a&b   → side-by-side compare (registered BEFORE `:id`)
 *   GET    /eval-suite-runs/:id           → run + case results (poll target)
 *   GET    /eval/dashboard                → workspace dashboard (per agent + recent runs)
 *   GET    /agents/:id/eval-dashboard     → per-agent dashboard (current, delta, trend, alert)
 */
const CompareQuery = z.object({ a: z.string().uuid(), b: z.string().uuid() });
const DashboardQuery = z.object({ days: z.coerce.number().int().min(1).max(365).optional() });

export default async function evalRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new EvalService(container, { logger: app.log });

  // ---- case from a finding -------------------------------------------------
  app.post(
    '/findings/:id/eval-case',
    { schema: { params: IdParams, response: { 200: EvalCaseCreated, 201: EvalCaseCreated } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const result = await service.createFromFinding(workspaceId, req.params.id);
      reply.status(result.created ? 201 : 200);
      return result;
    },
  );

  // ---- case CRUD -----------------------------------------------------------
  app.get(
    '/agents/:id/eval-cases',
    { schema: { params: IdParams, response: { 200: z.array(EvalCaseSummary) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.listCases(workspaceId, req.params.id);
    },
  );

  app.post(
    '/agents/:id/eval-cases',
    { schema: { params: IdParams, body: EvalCaseBody, response: { 201: EvalCaseSummary } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const created = await service.createCase(workspaceId, req.params.id, req.body);
      reply.status(201);
      return created;
    },
  );

  app.patch(
    '/eval-cases/:id',
    { schema: { params: IdParams, body: EvalCasePatch, response: { 200: EvalCaseSummary } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.updateCase(workspaceId, req.params.id, req.body);
    },
  );

  app.delete(
    '/eval-cases/:id',
    { schema: { params: IdParams, response: { 200: z.object({ ok: z.literal(true) }) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      await service.deleteCase(workspaceId, req.params.id);
      return { ok: true as const };
    },
  );

  // ---- running (LLM-spending → tight per-route limit) ------------------------
  app.post(
    '/eval-cases/:id/run',
    {
      schema: { params: IdParams, response: { 200: EvalRunResult } },
      config: { rateLimit: EVAL_RUN_RATE_LIMIT },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.runCase(workspaceId, req.params.id);
    },
  );

  app.post(
    '/agents/:id/eval-runs',
    {
      schema: { params: IdParams, response: { 202: EvalSuiteRun } },
      config: { rateLimit: EVAL_RUN_RATE_LIMIT },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const run = await service.startSuite(workspaceId, req.params.id);
      reply.status(202);
      return run;
    },
  );

  app.get(
    '/agents/:id/eval-runs',
    { schema: { params: IdParams, response: { 200: z.array(EvalSuiteRun) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.listSuiteRuns(workspaceId, req.params.id);
    },
  );

  // ---- suite runs: compare MUST be registered before `/:id` -------------------
  app.get(
    '/eval-suite-runs/compare',
    { schema: { querystring: CompareQuery, response: { 200: EvalCompare } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.compare(workspaceId, req.query.a, req.query.b);
    },
  );

  app.get(
    '/eval-suite-runs/:id',
    { schema: { params: IdParams, response: { 200: EvalSuiteRunDetail } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getSuiteRun(workspaceId, req.params.id);
    },
  );

  // ---- dashboards ------------------------------------------------------------
  app.get(
    '/eval/dashboard',
    { schema: { response: { 200: EvalWorkspaceDashboard } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.workspaceDashboard(workspaceId);
    },
  );

  app.get(
    '/agents/:id/eval-dashboard',
    { schema: { params: IdParams, querystring: DashboardQuery, response: { 200: EvalDashboard } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.agentDashboard(workspaceId, req.params.id, req.query.days);
    },
  );
}
