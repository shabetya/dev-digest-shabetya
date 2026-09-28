import { z } from 'zod';

/**
 * Central, zod-validated environment config. Loaded once at startup (from
 * `index.ts`) — the rest of the codebase receives the parsed `Config` value,
 * never reads `process.env` directly. Mirrors `server/src/platform/config.ts`'s
 * pattern (one env chokepoint, `loadConfig(env)` for testability).
 */
const EnvSchema = z.object({
  /** Base URL of the already-running @devdigest/api server. */
  DEVDIGEST_API_URL: z.string().url().default('http://localhost:3001'),
  /** How often to poll GET /pulls/:id/runs/active while waiting for a run. */
  RUN_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1500),
  /** Max total time to wait for a run before throwing a timeout error. */
  RUN_POLL_TIMEOUT_MS: z.coerce.number().int().positive().default(180_000),
});

export interface Config {
  apiUrl: string;
  pollIntervalMs: number;
  pollTimeoutMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.parse(env);
  return {
    apiUrl: parsed.DEVDIGEST_API_URL,
    pollIntervalMs: parsed.RUN_POLL_INTERVAL_MS,
    pollTimeoutMs: parsed.RUN_POLL_TIMEOUT_MS,
  };
}
