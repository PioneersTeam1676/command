import ical, { type EventInstance, type VEvent } from "node-ical";
import { addMonths, subMonths } from "date-fns";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { events } from "@/db/schema";
import { notifyEventChange } from "@/lib/events";
import { seasonForDate } from "@/lib/seasons";
import { readSettings, updateSettings } from "@/lib/settings";
import { fromZonedTime } from "date-fns-tz";
import { getEnv } from "@/lib/env";
import { assertPublicHttpUrl } from "./url-guard";

/** ICS mode: read-only import of a calendar's secret ICS address (spec 8). */

export const ICS_MAX_BYTES = 5 * 1024 * 1024;
export const ICS_MAX_EVENTS = 2000;
const FETCH_TIMEOUT_MS = 20_000;

export type Occurrence = {
  uid: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date;
  cancelled: boolean;
};

const paramText = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "val" in v) return String((v as { val: unknown }).val ?? "");
  return "";
};
// Plain text only: strip control characters and cap length.
const clean = (v: unknown, max: number) => paramText(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);

const HOUR = 3_600_000;

/** The calendar day an all-day value falls on, in the timezone it was written in. */
function fullDayLocal(d: Date & { tz?: string }): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: d.tz ?? "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function toOccurrence(inst: EventInstance, recurring: boolean, tz: string): Occurrence | null {
  const ev = inst.event as VEvent;
  const startRaw = inst.start;
  if (!startRaw || Number.isNaN(startRaw.getTime())) return null;
  let startsAt: Date;
  let endsAt: Date;
  if (inst.isFullDay) {
    // All-day: midnight to midnight in the team timezone (DTEND is exclusive in iCalendar).
    const startDay = fullDayLocal(startRaw);
    const endDay = inst.end && !Number.isNaN(inst.end.getTime()) ? fullDayLocal(inst.end) : null;
    startsAt = fromZonedTime(`${startDay}T00:00:00`, tz);
    endsAt = endDay && endDay > startDay ? fromZonedTime(`${endDay}T00:00:00`, tz) : new Date(startsAt.getTime() + 24 * HOUR);
  } else {
    startsAt = new Date(startRaw.getTime());
    endsAt = inst.end && !Number.isNaN(inst.end.getTime()) ? new Date(inst.end.getTime()) : new Date(startsAt.getTime() + HOUR);
    if (endsAt <= startsAt) endsAt = new Date(startsAt.getTime() + HOUR);
  }
  const baseUid = clean(ev.uid, 200);
  if (!baseUid) return null;
  return {
    uid: recurring ? `${baseUid}#${startsAt.toISOString()}` : baseUid,
    title: clean(inst.summary, 120) || "(no title)",
    description: clean(ev.description, 2000) || null,
    location: clean(ev.location, 200) || null,
    startsAt,
    endsAt,
    cancelled: String(ev.status ?? "").toUpperCase() === "CANCELLED",
  };
}

/** Parse ICS text and expand recurring events into individual occurrences inside [from, to]. */
export function parseIcs(text: string, window: { from: Date; to: Date }, tz: string): Occurrence[] {
  const data = ical.sync.parseICS(text);
  const out: Occurrence[] = [];
  for (const comp of Object.values(data)) {
    if (!comp || (comp as { type?: string }).type !== "VEVENT") continue;
    const ev = comp as VEvent;
    let instances: EventInstance[];
    try {
      instances = ical.expandRecurringEvent(ev, { from: window.from, to: window.to, expandOngoing: true });
    } catch {
      continue; // a malformed event shouldn't stop the rest of the calendar
    }
    const recurring = Boolean(ev.rrule);
    for (const inst of instances) {
      const occ = toOccurrence(inst, recurring || inst.isRecurring || inst.isOverride, tz);
      if (occ && occ.startsAt < window.to && occ.endsAt > window.from) out.push(occ);
    }
  }
  // A malformed feed can repeat an id; keep the last one.
  const byUid = new Map(out.map((o) => [o.uid, o]));
  return [...byUid.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()).slice(0, ICS_MAX_EVENTS);
}

export type FetchText = (url: URL) => Promise<string>;

/** Download an ICS file with a timeout and a size cap. */
export const fetchIcsText: FetchText = async (url) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: "text/calendar, text/plain, */*", "user-agent": "Command-Calendar-Sync" }, redirect: "follow" });
    if (!res.ok) throw new Error(res.status === 404 ? "Google says that address doesn't exist (404). Copy the secret address again." : `The calendar server answered ${res.status}.`);
    const reader = res.body?.getReader();
    if (!reader) return await res.text();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > ICS_MAX_BYTES) throw new Error("That calendar file is too big (over 5 MB).");
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } catch (e) {
    if ((e as { name?: string }).name === "AbortError") throw new Error("The calendar server took too long to answer.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
};

export const icsWindow = (now: Date) => ({ from: subMonths(now, 2), to: addMonths(now, 6) });

export type SyncResult = { created: number; updated: number; cancelled: number; unchanged: number; total: number; firstSync: boolean };

/**
 * Pull the calendar and reconcile it with the `events` table (imported events keyed by their ICS uid).
 * Creates new ones, updates changed ones, and cancels future ones that disappeared from the feed.
 * The very first import doesn't notify anyone (it would be a wall of notifications).
 */
export async function syncIcs(opts: { url: string; now?: Date; fetchText?: FetchText; allowPrivate?: boolean }): Promise<SyncResult> {
  const now = opts.now ?? new Date();
  const url = await assertPublicHttpUrl(opts.url, { allowPrivate: opts.allowPrivate ?? getEnv().ICS_ALLOW_PRIVATE_NETWORKS });
  const text = await (opts.fetchText ?? fetchIcsText)(url);
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error("That address didn't return a calendar. Make sure you copied the “Secret address in iCal format”.");
  const { timezone } = await readSettings();
  const window = icsWindow(now);
  const occurrences = parseIcs(text, window, timezone);

  const existingRows = await db
    .select()
    .from(events)
    .where(and(eq(events.source, "imported"), isNotNull(events.icsUid)));
  const firstSync = existingRows.length === 0;
  const byUid = new Map(existingRows.map((e) => [e.icsUid!, e]));
  const seen = new Set<string>();
  const result: SyncResult = { created: 0, updated: 0, cancelled: 0, unchanged: 0, total: occurrences.length, firstSync };

  for (const o of occurrences) {
    seen.add(o.uid);
    const cur = byUid.get(o.uid);
    if (!cur) {
      const season = await seasonForDate(new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(o.startsAt));
      const [row] = await db
        .insert(events)
        .values({ seasonId: season.id, title: o.title, description: o.description, locationText: o.location, startsAt: o.startsAt, endsAt: o.endsAt, cancelledAt: o.cancelled ? now : null, source: "imported", icsUid: o.uid })
        .onConflictDoNothing()
        .returning();
      if (row) {
        result.created++;
        if (!firstSync && !o.cancelled && row.startsAt > now) await notifyEventChange(row, "created", String(now.getTime())).catch(() => undefined);
      }
      continue;
    }
    const changed =
      cur.title !== o.title ||
      cur.description !== o.description ||
      cur.locationText !== o.location ||
      cur.startsAt.getTime() !== o.startsAt.getTime() ||
      cur.endsAt.getTime() !== o.endsAt.getTime() ||
      Boolean(cur.cancelledAt) !== o.cancelled;
    if (!changed) {
      result.unchanged++;
      continue;
    }
    const [row] = await db
      .update(events)
      .set({ title: o.title, description: o.description, locationText: o.location, startsAt: o.startsAt, endsAt: o.endsAt, cancelledAt: o.cancelled ? (cur.cancelledAt ?? now) : null })
      .where(eq(events.id, cur.id))
      .returning();
    result.updated++;
    if (row && row.startsAt > now) await notifyEventChange(row, o.cancelled && !cur.cancelledAt ? "cancelled" : "updated", `${now.getTime()}`).catch(() => undefined);
  }

  // Gone from the feed (deleted in Google Calendar): cancel future occurrences inside the window. History is left alone.
  for (const cur of existingRows) {
    if (seen.has(cur.icsUid!) || cur.cancelledAt) continue;
    if (cur.startsAt <= now || cur.startsAt < window.from || cur.startsAt > window.to) continue;
    const [row] = await db.update(events).set({ cancelledAt: now }).where(eq(events.id, cur.id)).returning();
    result.cancelled++;
    if (row) await notifyEventChange(row, "cancelled", "removed").catch(() => undefined);
  }
  return result;
}

const describe = (r: SyncResult) => `${r.total} events in the calendar: ${r.created} new, ${r.updated} changed, ${r.cancelled} removed.`;

/** Job entry point: sync if ICS mode is on and an address is saved; remember the outcome for the settings page. */
export async function runIcsSync(icsUrl: string | null | undefined, now: Date = new Date()): Promise<SyncResult | null> {
  if (!icsUrl) return null;
  try {
    const r = await syncIcs({ url: icsUrl, now });
    await updateSettings({ googleCalendarLastSyncAt: now, googleCalendarLastResult: `OK. ${describe(r)}` });
    return r;
  } catch (e) {
    await updateSettings({ googleCalendarLastSyncAt: now, googleCalendarLastResult: `Failed: ${e instanceof Error ? e.message : "unknown error"}` });
    throw e;
  }
}


