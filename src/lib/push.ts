import { and, eq, isNull } from "drizzle-orm";
import webpush from "web-push";
import { db } from "@/db";
import { pushSubscriptions, users } from "@/db/schema";
import { getEnv } from "@/lib/env";
import { readSettings } from "@/lib/settings";

/** Web Push delivery (VAPID). Multiple devices per user; dead subscriptions are disabled on 404/410. */
export type PushPayload = { title: string; body?: string; url?: string; tag?: string };

export type PushTarget = { endpoint: string; keys: { p256dh: string; auth: string } };
export type PushSender = (target: PushTarget, body: string) => Promise<{ statusCode: number }>;

let testSender: PushSender | null = null;
/** Tests inject a fake sender so nothing touches the network. */
export function setPushSenderForTests(s: PushSender | null) {
  testSender = s;
}

let configuredFor = "";

async function realSender(): Promise<PushSender> {
  const s = await readSettings();
  if (!s.vapidPublic || !s.vapidPrivate) throw new Error("VAPID keys are not generated yet");
  if (configuredFor !== s.vapidPublic) {
    webpush.setVapidDetails(getEnv().APP_URL, s.vapidPublic, s.vapidPrivate);
    configuredFor = s.vapidPublic;
  }
  return async (target, body) => {
    const r = await webpush.sendNotification(target, body, { TTL: 3600, urgency: "normal" });
    return { statusCode: r.statusCode };
  };
}

/** Send to every enabled device of a user. Returns the number of devices that accepted the message. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  const [u] = await db.select({ status: users.status }).from(users).where(eq(users.id, userId));
  if (!u || u.status !== "active") return 0;
  const subs = await db.select().from(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), isNull(pushSubscriptions.disabledAt)));
  if (subs.length === 0) return 0;
  const send = testSender ?? (await realSender());
  const body = JSON.stringify({ title: payload.title.slice(0, 120), body: payload.body?.slice(0, 240), url: payload.url ?? "/", tag: payload.tag });
  let delivered = 0;
  for (const sub of subs) {
    try {
      await send({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body);
      delivered++;
      await db.update(pushSubscriptions).set({ lastSuccessAt: new Date(), lastError: null }).where(eq(pushSubscriptions.id, sub.id));
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      const message = err instanceof Error ? err.message.slice(0, 200) : "send failed";
      if (status === 404 || status === 410) {
        // The browser or user removed this subscription. Stop trying.
        await db.update(pushSubscriptions).set({ disabledAt: new Date(), lastError: `expired (${status})` }).where(eq(pushSubscriptions.id, sub.id));
      } else {
        await db.update(pushSubscriptions).set({ lastError: `${status ?? ""} ${message}`.trim() }).where(eq(pushSubscriptions.id, sub.id));
      }
    }
  }
  return delivered;
}

export type PushStatus = "active" | "permission_denied" | "never_enabled" | "expired";

export const PUSH_STATUS_LABEL: Record<PushStatus, string> = {
  active: "Active",
  permission_denied: "Permission denied",
  never_enabled: "Never enabled",
  expired: "Subscription expired",
};

/** Classify a member for the admin Notifications page (spec 7.4). Pure. */
export function classifyPush(input: { enabledDevices: number; totalDevices: number; permission: string | null }): PushStatus {
  if (input.enabledDevices > 0) return "active";
  if (input.permission === "denied") return "permission_denied";
  if (input.totalDevices > 0) return "expired";
  return "never_enabled";
}
