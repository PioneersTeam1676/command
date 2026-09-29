import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions, users } from "@/db/schema";
import { classifyPush, type PushStatus } from "@/lib/push";

export async function saveSubscription(userId: string, sub: { endpoint: string; p256dh: string; auth: string; userAgent?: string | null }) {
  // The same browser can be signed in as someone else later; the endpoint moves to whoever registered last.
  await db
    .insert(pushSubscriptions)
    .values({ userId, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, userAgent: sub.userAgent?.slice(0, 300) ?? null })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId, p256dh: sub.p256dh, auth: sub.auth, userAgent: sub.userAgent?.slice(0, 300) ?? null, disabledAt: null, lastError: null },
    });
  await db.update(users).set({ pushPermission: "granted", pushPermissionAt: new Date() }).where(eq(users.id, userId));
}

export async function removeSubscription(userId: string, endpoint: string) {
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}

export async function recordPermission(userId: string, permission: "granted" | "denied" | "default") {
  await db.update(users).set({ pushPermission: permission, pushPermissionAt: new Date() }).where(eq(users.id, userId));
}

export async function myDeviceCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), isNull(pushSubscriptions.disabledAt)));
  return row?.n ?? 0;
}

export type MemberPushRow = { userId: string; name: string; role: string; status: PushStatus; devices: number; lastSuccessAt: Date | null };

/** Every active member with their push status, for the admin Notifications page. */
export async function pushOverview(): Promise<{ rows: MemberPushRow[]; counts: Record<PushStatus, number> }> {
  const members = await db
    .select({ id: users.id, name: users.name, role: users.role, permission: users.pushPermission })
    .from(users)
    .where(and(eq(users.status, "active"), inArray(users.role, ["member", "lead", "admin"])));
  const subs = await db.select().from(pushSubscriptions);
  const rows = members.map((m): MemberPushRow => {
    const mine = subs.filter((s) => s.userId === m.id);
    const enabled = mine.filter((s) => !s.disabledAt);
    const last = mine.map((s) => s.lastSuccessAt).filter((d): d is Date => d !== null).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    return {
      userId: m.id,
      name: m.name,
      role: m.role,
      status: classifyPush({ enabledDevices: enabled.length, totalDevices: mine.length, permission: m.permission }),
      devices: enabled.length,
      lastSuccessAt: last,
    };
  });
  const counts: Record<PushStatus, number> = { active: 0, permission_denied: 0, never_enabled: 0, expired: 0 };
  for (const r of rows) counts[r.status]++;
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return { rows, counts };
}
