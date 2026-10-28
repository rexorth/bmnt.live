import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>;

export function createDb(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    // Transaction-mode poolers (Neon's "-pooler" host, PgBouncer) can't use prepared statements.
    prepare: process.env.DATABASE_PREPARE !== "false",
  });
  return drizzle(client, { schema });
}

// Reuse one pool across hot reloads in development.
const globalForDb = globalThis as unknown as { bmntDb?: Db };

export function getDb(): Db {
  globalForDb.bmntDb ??= createDb();
  return globalForDb.bmntDb;
}

export { schema };
