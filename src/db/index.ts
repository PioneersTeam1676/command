import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

type Db = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __pool?: Pool; __db?: Db };

export function getPool(): Pool {
  if (!globalForDb.__pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is required");
    globalForDb.__pool = new Pool({ connectionString: url, max: 10 });
  }
  return globalForDb.__pool;
}

export function getDb(): Db {
  if (!globalForDb.__db) globalForDb.__db = drizzle(getPool(), { schema });
  return globalForDb.__db;
}

/** Lazy proxy so modules can `import { db }` without connecting at import time (build step). */
export const db: Db = new Proxy({} as Db, {
  get(_t, prop) {
    return Reflect.get(getDb(), prop);
  },
});

export { schema };
export type { Db };
