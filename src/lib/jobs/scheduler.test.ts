import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, hasTestDb } from "@/test/db";

describe.skipIf(!hasTestDb)("scheduler idempotency", () => {
  let drop: () => Promise<void>;
  beforeAll(async () => {
    drop = (await createTestDb()).drop;
  });
  afterAll(async () => {
    await drop?.();
  });

  it("runs a one-off job exactly once even when ticks overlap", async () => {
    const { registerJob, enqueue, runDueJobs } = await import("./scheduler");
    let runs = 0;
    registerJob("test.once", async () => {
      runs++;
      await new Promise((r) => setTimeout(r, 50));
    });
    await enqueue("test.once", { dedupeKey: "k1" });
    await enqueue("test.once", { dedupeKey: "k1" }); // duplicate enqueue is ignored
    await Promise.all([runDueJobs(), runDueJobs(), runDueJobs()]);
    await runDueJobs();
    expect(runs).toBe(1);
  });

  it("reschedules recurring jobs instead of finishing them", async () => {
    const { registerJob, ensureRecurringJobs, runDueJobs } = await import("./scheduler");
    const { db } = await import("@/db");
    const { jobs } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    let runs = 0;
    registerJob("test.recurring", async () => void runs++, { everySeconds: 60 });
    const t0 = new Date();
    await ensureRecurringJobs(t0);
    await ensureRecurringJobs(t0); // second call must not create a second row
    expect((await db.select().from(jobs).where(eq(jobs.kind, "test.recurring"))).length).toBe(1);
    await runDueJobs(t0);
    await runDueJobs(new Date(t0.getTime() + 10_000)); // not due yet
    expect(runs).toBe(1);
    await runDueJobs(new Date(t0.getTime() + 61_000));
    expect(runs).toBe(2);
  });

  it("retries a failing job with backoff and records the error", async () => {
    const { registerJob, enqueue, runDueJobs } = await import("./scheduler");
    const { db } = await import("@/db");
    const { jobs } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    registerJob("test.fail", async () => {
      throw new Error("boom");
    });
    await enqueue("test.fail", { dedupeKey: "f1" });
    const t0 = new Date();
    await runDueJobs(t0);
    const [row] = await db.select().from(jobs).where(eq(jobs.kind, "test.fail"));
    expect(row!.lastError).toBe("boom");
    expect(row!.doneAt).toBeNull();
    expect(row!.runAt.getTime()).toBeGreaterThan(t0.getTime());
  });
});
