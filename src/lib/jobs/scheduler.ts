import { sql } from "drizzle-orm";
import { db, getPool } from "@/db";
import { jobs } from "@/db/schema";

/**
 * In-process scheduler (spec 2). Started from instrumentation.ts, ticks every 30 s and runs due rows
 * from the `jobs` table. A Postgres advisory lock means only one app instance runs jobs at a time;
 * every handler must be idempotent because a tick can overlap a restart or a retry.
 */

export const TICK_MS = 30_000;
const SCHEDULER_LOCK = 727302;
const STALE_LOCK_MINUTES = 5;
const MAX_ATTEMPTS = 5;

/** Throw from a handler to try again later without counting it as a failed attempt (e.g. while the instance is read-only). */
export class RescheduleError extends Error {
  constructor(readonly delayMs: number, message = "rescheduled") {
    super(message);
  }
}

export type JobRow = typeof jobs.$inferSelect;
export type JobHandler = (job: JobRow, now: Date) => Promise<void>;

const handlers = new Map<string, JobHandler>();
const recurring = new Map<string, number>();

export function registerJob(kind: string, handler: JobHandler, opts: { everySeconds?: number } = {}) {
  handlers.set(kind, handler);
  if (opts.everySeconds) recurring.set(kind, opts.everySeconds);
}

/** Make sure each recurring job has its single row. Safe to call on every start. */
export async function ensureRecurringJobs(now: Date = new Date()) {
  for (const [kind, everySeconds] of recurring) {
    await db
      .insert(jobs)
      .values({ kind, dedupeKey: "recurring", runAt: now, payload: { everySeconds } })
      .onConflictDoNothing();
  }
}

/** Queue a one-off job. `dedupeKey` makes it idempotent. */
export async function enqueue(kind: string, opts: { runAt?: Date; payload?: Record<string, unknown>; dedupeKey?: string } = {}) {
  await db
    .insert(jobs)
    .values({ kind, runAt: opts.runAt ?? new Date(), payload: opts.payload ?? {}, dedupeKey: opts.dedupeKey ?? null })
    .onConflictDoNothing();
}

async function claimDue(now: Date, limit = 10): Promise<JobRow[]> {
  const res = await db.execute<Record<string, unknown>>(sql`
    update jobs set locked_at = ${now.toISOString()}::timestamptz, attempts = attempts + 1
    where id in (
      select id from jobs
      where done_at is null and run_at <= ${now.toISOString()}::timestamptz
        and (locked_at is null or locked_at < ${now.toISOString()}::timestamptz - make_interval(mins => ${STALE_LOCK_MINUTES}))
      order by run_at
      limit ${limit}
      for update skip locked
    )
    returning id, kind, dedupe_key as "dedupeKey", run_at as "runAt", payload, locked_at as "lockedAt", done_at as "doneAt", attempts, last_error as "lastError"
  `);
  return res.rows as unknown as JobRow[];
}

/** Run every due job once. Returns how many ran. Exported for tests. */
export async function runDueJobs(now: Date = new Date()): Promise<number> {
  const client = await getPool().connect();
  let ran = 0;
  try {
    const got = await client.query<{ locked: boolean }>("select pg_try_advisory_lock($1) as locked", [SCHEDULER_LOCK]);
    if (!got.rows[0]?.locked) return 0; // another instance is running jobs
    try {
      for (const job of await claimDue(now)) {
        ran++;
        const handler = handlers.get(job.kind);
        const every = (job.payload as { everySeconds?: number }).everySeconds;
        try {
          if (!handler) throw new Error(`No handler for job kind "${job.kind}"`);
          await handler(job, now);
          if (every) {
            await db.execute(sql`update jobs set run_at = ${new Date(now.getTime() + every * 1000).toISOString()}::timestamptz, locked_at = null, done_at = null, attempts = 0, last_error = null where id = ${job.id}`);
          } else {
            await db.execute(sql`update jobs set done_at = ${now.toISOString()}::timestamptz, locked_at = null where id = ${job.id}`);
          }
        } catch (err) {
          if (err instanceof RescheduleError) {
            await db.execute(sql`update jobs set run_at = ${new Date(now.getTime() + err.delayMs).toISOString()}::timestamptz, locked_at = null, attempts = greatest(attempts - 1, 0) where id = ${job.id}`);
            continue;
          }
          const message = err instanceof Error ? err.message : String(err);
          const giveUp = !every && job.attempts >= MAX_ATTEMPTS;
          const backoffMs = Math.min(2 ** job.attempts * 30_000, 3_600_000);
          await db.execute(sql`
            update jobs set last_error = ${message.slice(0, 500)}, locked_at = null,
              done_at = ${giveUp ? now.toISOString() : null}::timestamptz,
              run_at = ${new Date(now.getTime() + (every ? every * 1000 : backoffMs)).toISOString()}::timestamptz
            where id = ${job.id}`);
          console.error(`[jobs] ${job.kind} failed: ${message}`);
        }
      }
    } finally {
      await client.query("select pg_advisory_unlock($1)", [SCHEDULER_LOCK]);
    }
  } finally {
    client.release();
  }
  return ran;
}

const g = globalThis as unknown as { __schedulerTimer?: NodeJS.Timeout };

export async function startScheduler() {
  if (g.__schedulerTimer) return; // once per process
  await ensureRecurringJobs();
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runDueJobs();
    } catch (err) {
      console.error("[jobs] tick failed:", err instanceof Error ? err.message : err);
    } finally {
      running = false;
    }
  };
  g.__schedulerTimer = setInterval(tick, TICK_MS);
  g.__schedulerTimer.unref?.();
  void tick();
}
