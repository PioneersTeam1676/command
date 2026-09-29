import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { inAppNotifications, memberDays, notificationPrefs } from "@/db/schema";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";

/** Absent row = enabled. Members can only switch types on or off; admins set the schedule. */
export async function getPrefs(userId: string): Promise<Map<string, boolean>> {
  const rows = await db.select().from(notificationPrefs).where(eq(notificationPrefs.userId, userId));
  return new Map(rows.map((r) => [r.type, r.enabled]));
}

export async function setPref(userId: string, type: string, enabled: boolean): Promise<boolean> {
  if (!NOTIFICATION_TYPES.some((t) => t.key === type)) return false;
  await db
    .insert(notificationPrefs)
    .values({ userId, type, enabled })
    .onConflictDoUpdate({ target: [notificationPrefs.userId, notificationPrefs.type], set: { enabled } });
  return true;
}

/** Which weekdays this person attends. Default: every workday. */
export async function getAttendingDays(userId: string, workdays: number[]): Promise<Set<number>> {
  const rows = await db.select().from(memberDays).where(eq(memberDays.userId, userId));
  const off = new Set(rows.filter((r) => !r.attending).map((r) => r.weekday));
  return new Set(workdays.filter((d) => !off.has(d)));
}

export async function saveAttendingDays(userId: string, workdays: number[], attending: number[]) {
  const on = new Set(attending);
  for (const weekday of workdays) {
    await db
      .insert(memberDays)
      .values({ userId, weekday, attending: on.has(weekday) })
      .onConflictDoUpdate({ target: [memberDays.userId, memberDays.weekday], set: { attending: on.has(weekday) } });
  }
}

export async function listInbox(userId: string, limit = 20) {
  return db.select().from(inAppNotifications).where(eq(inAppNotifications.userId, userId)).orderBy(desc(inAppNotifications.createdAt)).limit(limit);
}

export async function markAllRead(userId: string) {
  await db.update(inAppNotifications).set({ readAt: new Date() }).where(and(eq(inAppNotifications.userId, userId), isNull(inAppNotifications.readAt)));
}
