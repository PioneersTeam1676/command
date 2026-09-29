import { sql } from "drizzle-orm";
import { db } from "@/db";

export type RateResult = { allowed: boolean; count: number; retryAfterSeconds: number };

/**
 * Fixed-window counter in Postgres (works across app instances, survives restarts).
 * Counts this attempt. `allowed` is false once the count in the window exceeds `limit`.
 */
export async function hit(key: string, limit: number, windowSeconds: number): Promise<RateResult> {
  const res = await db.execute<{ count: number; age: number }>(sql`
    insert into rate_limits as r (key, count, window_start) values (${key}, 1, now())
    on conflict (key) do update set
      count = case when r.window_start < now() - make_interval(secs => ${windowSeconds}) then 1 else r.count + 1 end,
      window_start = case when r.window_start < now() - make_interval(secs => ${windowSeconds}) then now() else r.window_start end
    returning count, extract(epoch from (now() - window_start))::float as age
  `);
  const row = res.rows[0]!;
  return {
    allowed: row.count <= limit,
    count: row.count,
    retryAfterSeconds: Math.max(1, Math.ceil(windowSeconds - row.age)),
  };
}

/** Forget a key, e.g. after a successful sign-in. */
export async function reset(key: string) {
  await db.execute(sql`delete from rate_limits where key = ${key}`);
}

/** Housekeeping, called from the scheduler. */
export async function purgeOldRateLimits() {
  await db.execute(sql`delete from rate_limits where window_start < now() - interval '1 day'`);
}
