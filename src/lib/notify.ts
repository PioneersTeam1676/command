import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { inAppNotifications, notificationLog, notificationPrefs, users } from "@/db/schema";
import { sendMail } from "@/lib/mail";
import { sendPushToUser } from "@/lib/push";

export type NotifyInput = {
  userIds: string[];
  /** Notification type key (see notification prefs). */
  type: string;
  title: string;
  body?: string;
  url?: string;
  /** Same (user, type, dedupeKey) is never sent twice. */
  dedupeKey: string;
  /** Sent by email only when the user has no working push device and SMTP is configured. */
  emailFallback?: { subject: string; text: string };
  /** Skip the in-app inbox row (rare). */
  skipInApp?: boolean;
};

/**
 * Deliver one notification to each user: in-app inbox row plus web push, with idempotence via
 * `notification_log`. Respects per-type preferences. Returns how many users were newly notified.
 */
export async function notify(input: NotifyInput): Promise<number> {
  if (input.userIds.length === 0) return 0;
  const ids = [...new Set(input.userIds)];

  const disabled = await db
    .select({ userId: notificationPrefs.userId })
    .from(notificationPrefs)
    .where(and(inArray(notificationPrefs.userId, ids), eq(notificationPrefs.type, input.type), eq(notificationPrefs.enabled, false)));
  const off = new Set(disabled.map((d) => d.userId));

  let sent = 0;
  for (const userId of ids) {
    if (off.has(userId)) continue;
    const claimed = await db
      .insert(notificationLog)
      .values({ userId, type: input.type, dedupeKey: input.dedupeKey, result: "pending" })
      .onConflictDoNothing()
      .returning({ id: notificationLog.id });
    if (claimed.length === 0) continue; // already sent

    if (!input.skipInApp) {
      await db.insert(inAppNotifications).values({
        userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        url: input.url ?? null,
      });
    }
    let pushed = 0;
    try {
      pushed = await sendPushToUser(userId, { title: input.title, body: input.body, url: input.url, tag: input.type });
    } catch {
      pushed = 0;
    }
    let result = pushed > 0 ? "push" : "in_app";
    if (pushed === 0 && input.emailFallback) {
      const [u] = await db.select({ email: users.email, status: users.status }).from(users).where(eq(users.id, userId));
      if (u && u.status !== "deactivated") {
        const r = await sendMail(u.email, input.emailFallback.subject, input.emailFallback.text);
        if (r.sent) result = "email";
      }
    }
    await db
      .update(notificationLog)
      .set({ result })
      .where(and(eq(notificationLog.userId, userId), eq(notificationLog.type, input.type), eq(notificationLog.dedupeKey, input.dedupeKey)));
    sent++;
  }
  return sent;
}

/** All active admins. */
export async function adminIds(): Promise<string[]> {
  const rows = await db.select({ id: users.id }).from(users).where(and(eq(users.role, "admin"), eq(users.status, "active")));
  return rows.map((r) => r.id);
}
