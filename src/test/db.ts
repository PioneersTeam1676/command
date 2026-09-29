import { Pool } from "pg";
import { randomBytes } from "node:crypto";

export const hasTestDb = Boolean(process.env.TEST_DATABASE_URL);

/**
 * Creates a throwaway database, migrates it and points DATABASE_URL at it. Call in `beforeAll`,
 * before importing any module that touches `@/db`. Needs TEST_DATABASE_URL (a superuser-ish URL,
 * e.g. postgres://command:command@localhost:54329/command).
 */
export async function createTestDb() {
  const adminUrl = process.env.TEST_DATABASE_URL!;
  const name = `cmd_test_${randomBytes(6).toString("hex")}`;
  const admin = new Pool({ connectionString: adminUrl, max: 1 });
  await admin.query(`create database ${name}`);
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.toString();
  const { runMigrations } = await import("@/db/migrate");
  await runMigrations(url.toString());
  return {
    url: url.toString(),
    async drop() {
      const { getPool } = await import("@/db");
      await getPool().end().catch(() => undefined);
      await new Promise((r) => setTimeout(r, 50)); // let the driver finish closing before the database is dropped
      await admin.query(`drop database if exists ${name} with (force)`);
      await admin.end();
    },
  };
}
