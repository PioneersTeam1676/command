// The leaderboard-off server shares the e2e database. Wait until the first server has created and migrated it.
import pg from "pg";

const url = process.env.DATABASE_URL;
const deadline = Date.now() + 100_000;
while (Date.now() < deadline) {
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    const r = await pool.query("select to_regclass('public.team_settings') as t");
    if (r.rows[0].t) {
      await pool.end();
      process.exit(0);
    }
  } catch {
    /* database not there yet */
  }
  await pool.end().catch(() => undefined);
  await new Promise((r) => setTimeout(r, 500));
}
console.error("timed out waiting for the e2e database");
process.exit(1);
