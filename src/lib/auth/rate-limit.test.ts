import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, hasTestDb } from "@/test/db";

describe.skipIf(!hasTestDb)("rate limiting", () => {
  let drop: () => Promise<void>;
  beforeAll(async () => {
    drop = (await createTestDb()).drop;
  });
  afterAll(async () => {
    await drop?.();
  });
  it("allows up to the limit then blocks, per key", async () => {
    const { hit, reset } = await import("./rate-limit");
    for (let i = 1; i <= 3; i++) expect((await hit("k1", 3, 60)).allowed).toBe(true);
    const blocked = await hit("k1", 3, 60);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect((await hit("k2", 3, 60)).allowed).toBe(true);
    await reset("k1");
    expect((await hit("k1", 3, 60)).allowed).toBe(true);
  });
  it("starts a fresh window once the old one has passed", async () => {
    const { hit } = await import("./rate-limit");
    const { db } = await import("@/db");
    const { rateLimits } = await import("@/db/schema");
    await hit("k3", 1, 60);
    expect((await hit("k3", 1, 60)).allowed).toBe(false);
    await db.update(rateLimits).set({ windowStart: new Date(Date.now() - 120_000) });
    expect((await hit("k3", 1, 60)).allowed).toBe(true);
  });
});
