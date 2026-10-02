import { and, asc, eq, gt, ne } from "drizzle-orm";
import { db } from "@/db";
import { calendarFeeds, events, signupEntries, signupSheets, signupSlots, users, type Role } from "@/db/schema";
import { hashToken, randomToken } from "@/lib/auth/tokens";
import { getEnv } from "@/lib/env";
import { buildCalendar, type IcsEvent } from "@/lib/ics-writer";
import { getSettings } from "@/lib/settings";
import { signupUrl } from "@/lib/signups";

const DAY = 86_400_000;
/** Ended or cancelled shifts stay in the feed this long, so calendars can drop the cancelled ones. */
const KEEP_MS = 30 * DAY;

export async function feedStatus(userId: string) {
  const [f] = await db.select({ createdAt: calendarFeeds.createdAt, lastFetchedAt: calendarFeeds.lastFetchedAt }).from(calendarFeeds).where(eq(calendarFeeds.userId, userId));
  return f ? { exists: true as const, createdAt: f.createdAt, lastFetchedAt: f.lastFetchedAt } : { exists: false as const };
}

/** The address for a token. Shown once, when the feed is made or reset, and never stored in the clear. */
export const feedUrl = (token: string) => `${getEnv().APP_URL.replace(/\/$/, "")}/api/calendar/shifts/${token}.ics`;

/** Makes the feed, or replaces it (the old address stops working at once). Returns the new secret. */
export async function resetFeed(userId: string): Promise<string> {
  const token = randomToken(24);
  await db
    .insert(calendarFeeds)
    .values({ userId, tokenHash: hashToken(token) })
    .onConflictDoUpdate({ target: calendarFeeds.userId, set: { tokenHash: hashToken(token), createdAt: new Date(), lastFetchedAt: null } });
  return token;
}

export async function revokeFeed(userId: string): Promise<void> {
  await db.delete(calendarFeeds).where(eq(calendarFeeds.userId, userId));
}

/** Who a feed token belongs to, if it's live and the person can still use Command. Records the fetch. */
export async function userForFeedToken(rawToken: string): Promise<{ id: string; role: Role } | null> {
  const token = rawToken.replace(/\.ics$/i, "");
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const [row] = await db
    .select({ id: users.id, role: users.role, status: users.status })
    .from(calendarFeeds)
    .innerJoin(users, eq(users.id, calendarFeeds.userId))
    .where(eq(calendarFeeds.tokenHash, hashToken(token)));
  if (!row || row.status !== "active") return null;
  await db.update(calendarFeeds).set({ lastFetchedAt: new Date() }).where(eq(calendarFeeds.userId, row.id));
  return { id: row.id, role: row.role };
}

/** The feed itself: this person's shifts (waitlisted ones as tentative), plus recently cancelled ones marked cancelled. */
export async function shiftsIcs(user: { id: string; role: Role }, now: Date = new Date()): Promise<string> {
  const env = getEnv();
  const settings = await getSettings();
  const host = new URL(env.APP_URL).hostname;
  const rows = await db
    .select({ entry: signupEntries, slot: signupSlots, eventId: events.id, eventTitle: events.title, locationText: events.locationText, eventCancelledAt: events.cancelledAt })
    .from(signupEntries)
    .innerJoin(signupSlots, eq(signupSlots.id, signupEntries.slotId))
    .innerJoin(signupSheets, eq(signupSheets.id, signupSlots.sheetId))
    .innerJoin(events, eq(events.id, signupSheets.eventId))
    .where(and(eq(signupEntries.userId, user.id), ne(signupSlots.kind, "attend"), gt(signupSlots.endsAt, new Date(now.getTime() - KEEP_MS))))
    .orderBy(asc(signupSlots.startsAt));

  const items: IcsEvent[] = rows.map((r) => {
    const cancelled = Boolean(r.slot.cancelledAt || r.eventCancelledAt);
    const waiting = r.entry.status === "waitlisted";
    const link = `${env.APP_URL.replace(/\/$/, "")}${signupUrl(user.role, r.eventId)}`;
    return {
      uid: `shift-${r.entry.id}@${host}`,
      start: r.slot.startsAt,
      end: r.slot.endsAt,
      summary: `${cancelled ? "Cancelled: " : waiting ? "Waitlist: " : ""}${r.slot.title} (${r.eventTitle})`,
      description: [r.slot.description, waiting ? "You're on the waitlist." : null, link].filter(Boolean).join("\n"),
      location: r.locationText ?? undefined,
      url: link,
      status: cancelled ? "CANCELLED" : waiting ? "TENTATIVE" : "CONFIRMED",
      stamp: r.entry.createdAt,
      // Clients replace an entry only when its sequence goes up: promoted and cancelled versions outrank the first.
      sequence: cancelled ? 2 : r.entry.promotedAt ? 1 : 0,
    };
  });
  return buildCalendar(`${settings.name} shifts`, items);
}
