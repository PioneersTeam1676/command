import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, hasTestDb } from "@/test/db";
import { classifyPush } from "./push";

describe("classifyPush", () => {
  it("active wins", () => expect(classifyPush({ enabledDevices: 1, totalDevices: 2, permission: "denied" })).toBe("active"));
  it("permission denied", () => expect(classifyPush({ enabledDevices: 0, totalDevices: 0, permission: "denied" })).toBe("permission_denied"));
  it("expired when only dead subscriptions remain", () => expect(classifyPush({ enabledDevices: 0, totalDevices: 1, permission: "granted" })).toBe("expired"));
  it("never enabled", () => {
    expect(classifyPush({ enabledDevices: 0, totalDevices: 0, permission: null })).toBe("never_enabled");
    expect(classifyPush({ enabledDevices: 0, totalDevices: 0, permission: "default" })).toBe("never_enabled");
  });
});

describe.skipIf(!hasTestDb)("push delivery", () => {
  let drop: () => Promise<void>;
  let userId: string;
  let goneId: string;

  beforeAll(async () => {
    process.env.APP_URL = "http://localhost:3000";
    drop = (await createTestDb()).drop;
    const { db } = await import("@/db");
    const { users, teamSettings } = await import("@/db/schema");
    await db.insert(teamSettings).values({ id: 1 });
    userId = (await db.insert(users).values({ email: "p@x.com", name: "P", status: "active" }).returning({ id: users.id }))[0]!.id;
    goneId = (await db.insert(users).values({ email: "g@x.com", name: "G", status: "deactivated" }).returning({ id: users.id }))[0]!.id;
  });
  afterAll(async () => {
    const { setPushSenderForTests } = await import("./push");
    setPushSenderForTests(null);
    await drop?.();
  });

  const sub = (userId: string, n: number) => ({ userId, endpoint: `https://push.example/${userId}/${n}`, p256dh: "k", auth: "a" });

  it("delivers to every enabled device and records success", async () => {
    const { db } = await import("@/db");
    const { pushSubscriptions } = await import("@/db/schema");
    const { sendPushToUser, setPushSenderForTests } = await import("./push");
    await db.insert(pushSubscriptions).values([sub(userId, 1), sub(userId, 2)]);
    const sent: string[] = [];
    setPushSenderForTests(async (t) => {
      sent.push(t.endpoint);
      return { statusCode: 201 };
    });
    expect(await sendPushToUser(userId, { title: "Hi", body: "there", url: "/x" })).toBe(2);
    expect(sent).toHaveLength(2);
    const rows = await db.select().from(pushSubscriptions);
    expect(rows.every((r) => r.lastSuccessAt !== null && r.lastError === null)).toBe(true);
  });

  it("disables a subscription on 410/404 and keeps working ones; other errors are recorded, not fatal", async () => {
    const { db } = await import("@/db");
    const { pushSubscriptions } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { sendPushToUser, setPushSenderForTests } = await import("./push");
    setPushSenderForTests(async (t) => {
      if (t.endpoint.endsWith("/1")) throw Object.assign(new Error("Gone"), { statusCode: 410 });
      if (t.endpoint.endsWith("/2")) throw Object.assign(new Error("boom"), { statusCode: 500 });
      return { statusCode: 201 };
    });
    await db.insert(pushSubscriptions).values(sub(userId, 3));
    expect(await sendPushToUser(userId, { title: "x" })).toBe(1);
    const rows = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
    const by = (n: number) => rows.find((r) => r.endpoint.endsWith(`/${n}`))!;
    expect(by(1).disabledAt).not.toBeNull();
    expect(by(2).disabledAt).toBeNull();
    expect(by(2).lastError).toContain("500");
    // The dead one is skipped from now on.
    let calls = 0;
    setPushSenderForTests(async () => (calls++, { statusCode: 201 }));
    await sendPushToUser(userId, { title: "again" });
    expect(calls).toBe(2);
  });

  it("does nothing for deactivated users or users with no devices", async () => {
    const { db } = await import("@/db");
    const { pushSubscriptions } = await import("@/db/schema");
    const { sendPushToUser, setPushSenderForTests } = await import("./push");
    let calls = 0;
    setPushSenderForTests(async () => (calls++, { statusCode: 201 }));
    await db.insert(pushSubscriptions).values(sub(goneId, 1));
    expect(await sendPushToUser(goneId, { title: "x" })).toBe(0);
    expect(calls).toBe(0);
  });

  it("moves an endpoint to the newest signed-in user and re-enables it", async () => {
    const { saveSubscription } = await import("./push-devices");
    const { db } = await import("@/db");
    const { pushSubscriptions } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    await saveSubscription(goneId, { endpoint: `https://push.example/${userId}/1`, p256dh: "k2", auth: "a2" });
    const [row] = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, `https://push.example/${userId}/1`));
    expect(row).toMatchObject({ userId: goneId, p256dh: "k2", disabledAt: null });
  });
});
