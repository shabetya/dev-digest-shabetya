import { z } from 'zod';

const Env = z.object({
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string(),
  NOTIFICATIONS_ENABLED: z.coerce.boolean().default(true),
});

export type AppConfig = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return Env.parse(env);
}
