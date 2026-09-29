import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const MIGRATION_LOCK = 727301;

/** Run SQL migrations at startup. A Postgres advisory lock keeps concurrent instances from racing. */
export async function runMigrations(databaseUrl = process.env.DATABASE_URL): Promise<void> {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("select pg_advisory_lock($1)", [MIGRATION_LOCK]);
    const folder = process.env.MIGRATIONS_DIR ?? path.join(process.cwd(), "drizzle");
    await migrate(drizzle(client), { migrationsFolder: folder });
  } finally {
    await client.query("select pg_advisory_unlock($1)", [MIGRATION_LOCK]).catch(() => undefined);
    client.release();
    await pool.end();
  }
}
