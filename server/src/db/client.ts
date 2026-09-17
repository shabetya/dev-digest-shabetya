import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase, type PostgresJsTransaction } from 'drizzle-orm/postgres-js';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import { schema } from './schema.js';

export type Db = PostgresJsDatabase<typeof schema>;

/**
 * The handle passed into a `db.transaction(async (tx) => ...)` callback.
 * Repositories that need atomicity across more than one statement accept an
 * optional `tx?: Tx` last parameter — see `onion-architecture` skill:
 * "the caller owns the transaction; the repository receives it". When no
 * caller has one open, the repository opens its own (it owns that invariant).
 */
export type Tx = PostgresJsTransaction<typeof schema, ExtractTablesWithRelations<typeof schema>>;

export interface DbHandle {
  db: Db;
  sql: postgres.Sql;
  close: () => Promise<void>;
}

/**
 * Create a Drizzle client over postgres-js. Used by the app (one shared handle)
 * and by the Testcontainers harness (per-test handle).
 */
export function createDb(databaseUrl: string, opts?: { max?: number }): DbHandle {
  const sql = postgres(databaseUrl, { max: opts?.max ?? 10 });
  const db = drizzle(sql, { schema });
  return {
    db,
    sql,
    close: async () => {
      await sql.end({ timeout: 5 });
    },
  };
}
