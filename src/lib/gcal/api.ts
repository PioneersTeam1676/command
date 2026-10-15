import { and, eq } from "drizzle-orm";
import { google, type calendar_v3 } from "googleapis";
import { z } from "zod";
import { db } from "@/db";
import { events } from "@/db/schema";
import { getEnv } from "@/lib/env";
import type { EventChangeKind } from "@/lib/gcal-sync";
import { seasonForDate } from "@/lib/seasons";
import { readSettings } from "@/lib/settings";
import { localDateOf, localToUtc } from "@/lib/time";

/**
 * Google Calendar API mode (spec 8). Command is the source of truth: create/edit/cancel in Command is
 * pushed to the calendar and the Google event id is stored. There is no two-way sync: changes made
 * directly in Google Calendar afterwards are not read back, and imported events are never pushed back.
 */

export type GEvent = {
  id?: string | null;
  summary?: string | null;
  description?: string | null;
  location?: string | null;
  status?: string | null;
  start?: { dateTime?: string | null; date?: string | null; timeZone?: string | null } | null;
  end?: { dateTime?: string | null; date?: string | null; timeZone?: string | null } | null;
  extendedProperties?: { private?: Record<string, string> | null } | null;
};

/** The few calendar calls we need, so tests can swap in a fake. */
export interface CalendarApi {
  get(calendarId: string): Promise<{ summary?: string | null }>;
  insert(calendarId: string, body: GEvent): Promise<GEvent>;
  patch(calendarId: string, eventId: string, body: GEvent): Promise<GEvent>;
  list(calendarId: string, p: { timeMin: string; timeMax: string; pageToken?: string; privateExtendedProperty?: string }): Promise<{ items: GEvent[]; nextPageToken?: string | null }>;
}

const serviceAccountSchema = z.object({ client_email: z.string().email(), private_key: z.string().min(50) });

export function parseServiceAccount(json: string | undefined): { ok: true; email: string; key: string } | { ok: false; error: string } {
  if (!json) return { ok: false, error: "GOOGLE_SERVICE_ACCOUNT_JSON isn't set." };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: "GOOGLE_SERVICE_ACCOUNT_JSON isn't valid JSON. Paste the whole key file on one line." };
  }
  const p = serviceAccountSchema.safeParse(raw);
  if (!p.success) return { ok: false, error: "GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key. Use the key file downloaded from Google Cloud." };
  return { ok: true, email: p.data.client_email, key: p.data.private_key.replace(/\\n/g, "\n") };
}

let testApi: CalendarApi | null = null;
export function setCalendarApiForTests(api: CalendarApi | null) {
  testApi = api;
}

function realApi(): CalendarApi {
  const sa = parseServiceAccount(getEnv().GOOGLE_SERVICE_ACCOUNT_JSON);
  if (!sa.ok) throw new Error(sa.error);
  const auth = new google.auth.JWT({ email: sa.email, key: sa.key, scopes: ["https://www.googleapis.com/auth/calendar"] });
  const cal = google.calendar({ version: "v3", auth });
  return {
    get: async (calendarId) => (await cal.calendars.get({ calendarId })).data,
    insert: async (calendarId, body) => (await cal.events.insert({ calendarId, requestBody: body as calendar_v3.Schema$Event })).data as GEvent,
    patch: async (calendarId, eventId, body) => (await cal.events.patch({ calendarId, eventId, requestBody: body as calendar_v3.Schema$Event })).data as GEvent,
    list: async (calendarId, p) => {
      const r = await cal.events.list({ calendarId, timeMin: p.timeMin, timeMax: p.timeMax, pageToken: p.pageToken, privateExtendedProperty: p.privateExtendedProperty ? [p.privateExtendedProperty] : undefined, singleEvents: true, orderBy: "startTime", maxResults: 250, showDeleted: false });
      return { items: (r.data.items ?? []) as GEvent[], nextPageToken: r.data.nextPageToken };
    },
  };
}

const client = () => testApi ?? realApi();

export type ApiConfig = { ok: true; calendarId: string } | { ok: false; error: string };

export function apiConfig(): ApiConfig {
  const env = getEnv();
  if (env.GOOGLE_CALENDAR_MODE !== "api") return { ok: false, error: "Google Calendar API mode is off (GOOGLE_CALENDAR_MODE)." };
  if (!env.GOOGLE_CALENDAR_ID) return { ok: false, error: "GOOGLE_CALENDAR_ID isn't set." };
  if (!testApi) {
    const sa = parseServiceAccount(env.GOOGLE_SERVICE_ACCOUNT_JSON);
    if (!sa.ok) return sa;
  }
  return { ok: true, calendarId: env.GOOGLE_CALENDAR_ID };
}

/** Turn Google's errors into something a non-technical admin can act on. */
export function friendlyGoogleError(e: unknown): string {
  const err = e as { code?: number | string; status?: number; message?: string; errors?: { reason?: string }[] };
  const code = Number(err.code ?? err.status);
  const msg = err.message ?? "unknown error";
  if (code === 404) return "Google can't find that calendar. Check GOOGLE_CALENDAR_ID, and make sure the calendar is shared with the service account's email (with “Make changes to events”).";
  if (code === 403) return "Google says the service account isn't allowed to change that calendar. Share the calendar with the service account's email and give it “Make changes to events”.";
  if (code === 401 || /invalid_grant|invalid_client|unauthorized/i.test(msg)) return "Google rejected the service account key. Download a fresh key file and update GOOGLE_SERVICE_ACCOUNT_JSON.";
  if (/ENOTFOUND|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|fetch failed/i.test(msg)) return "We couldn't reach Google. Check the server's internet connection and try again.";
  if (code === 429) return "Google is asking us to slow down. It will retry automatically.";
  return `Google returned an error: ${msg}`;
}

type EventRow = typeof events.$inferSelect;

export function toGoogleEvent(e: EventRow, tz: string): GEvent {
  return {
    summary: e.cancelledAt ? `[Cancelled] ${e.title}` : e.title,
    description: e.description ?? undefined,
    location: e.locationText ?? undefined,
    status: "confirmed",
    start: { dateTime: e.startsAt.toISOString(), timeZone: tz },
    end: { dateTime: e.endsAt.toISOString(), timeZone: tz },
    extendedProperties: { private: { commandEventId: e.id } },
  };
}

/**
 * Push one event. Safe to retry: it never creates a second Google event for the same Command event
 * (it looks the event up by its private property first). Throws on failure so the job is retried.
 */
export async function pushEventToGoogle(eventId: string, kind: EventChangeKind): Promise<"skipped" | "created" | "updated"> {
  const cfg = apiConfig();
  if (!cfg.ok) return "skipped";
  const [e] = await db.select().from(events).where(eq(events.id, eventId));
  if (!e || e.source !== "app") return "skipped"; // imported events are never pushed back (no loops)
  const { timezone } = await readSettings();
  const api = client();
  const body = toGoogleEvent(e, timezone);

  let googleId = e.gcalEventId;
  if (!googleId) {
    const found = await api.list(cfg.calendarId, {
      timeMin: new Date(e.startsAt.getTime() - 86_400_000).toISOString(),
      timeMax: new Date(e.endsAt.getTime() + 86_400_000).toISOString(),
      privateExtendedProperty: `commandEventId=${e.id}`,
    });
    googleId = found.items.find((i) => i.extendedProperties?.private?.commandEventId === e.id)?.id ?? null;
  }
  if (googleId) {
    await api.patch(cfg.calendarId, googleId, body);
    if (!e.gcalEventId) await db.update(events).set({ gcalEventId: googleId }).where(eq(events.id, e.id));
    return "updated";
  }
  if (kind === "cancelled") return "skipped"; // never made it to Google, nothing to cancel
  const created = await api.insert(cfg.calendarId, body);
  if (!created.id) throw new Error("Google didn't return an event id");
  await db.update(events).set({ gcalEventId: created.id }).where(eq(events.id, e.id));
  return "created";
}

export type ImportResult = { imported: number; skippedDuplicates: number; skippedCancelled: number; skippedOwn: number; total: number };
export const MAX_IMPORT_DAYS = 366;
export const MAX_IMPORT_EVENTS = 2000;

/**
 * Import events from the calendar (a date range, usually in the past) so members can add attendance for
 * things they went to. Duplicates are skipped by Google event id, so it is safe to run repeatedly. Imported
 * events are `source = imported`, so they are never pushed back.
 */
export async function importPastEvents(range: { from: string; to: string }): Promise<ImportResult> {
  const cfg = apiConfig();
  if (!cfg.ok) throw new Error(cfg.error);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(range.from) || !/^\d{4}-\d{2}-\d{2}$/.test(range.to)) throw new Error("Choose a start and end date.");
  if (range.to < range.from) throw new Error("The end date can't be before the start date.");
  if ((Date.parse(range.to) - Date.parse(range.from)) / 86_400_000 > MAX_IMPORT_DAYS) throw new Error("Pick a range of a year or less.");
  const { timezone } = await readSettings();
  const timeMin = localToUtc(range.from, "00:00", timezone).toISOString();
  const endDate = new Date(Date.parse(`${range.to}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const timeMax = localToUtc(endDate, "00:00", timezone).toISOString();
  const api = client();
  const result: ImportResult = { imported: 0, skippedDuplicates: 0, skippedCancelled: 0, skippedOwn: 0, total: 0 };

  let pageToken: string | undefined;
  do {
    const page = await api.list(cfg.calendarId, { timeMin, timeMax, pageToken });
    for (const item of page.items) {
      if (result.total >= MAX_IMPORT_EVENTS) break;
      result.total++;
      if (!item.id) continue;
      if (item.status === "cancelled") {
        result.skippedCancelled++;
        continue;
      }
      if (item.extendedProperties?.private?.commandEventId) {
        result.skippedOwn++; // created by Command; it already exists here
        continue;
      }
      const [dupe] = await db.select({ id: events.id }).from(events).where(and(eq(events.gcalEventId, item.id)));
      if (dupe) {
        result.skippedDuplicates++;
        continue;
      }
      let startsAt: Date;
      let endsAt: Date;
      if (item.start?.dateTime) {
        startsAt = new Date(item.start.dateTime);
        endsAt = item.end?.dateTime ? new Date(item.end.dateTime) : new Date(startsAt.getTime() + 3_600_000);
      } else if (item.start?.date) {
        startsAt = localToUtc(item.start.date, "00:00", timezone);
        endsAt = item.end?.date && item.end.date > item.start.date ? localToUtc(item.end.date, "00:00", timezone) : new Date(startsAt.getTime() + 86_400_000);
      } else continue;
      if (Number.isNaN(startsAt.getTime()) || endsAt <= startsAt) endsAt = new Date(startsAt.getTime() + 3_600_000);
      const season = await seasonForDate(localDateOf(startsAt, timezone));
      const ok = await db
        .insert(events)
        .values({
          seasonId: season.id,
          title: (item.summary ?? "(no title)").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 120) || "(no title)",
          description: item.description?.trim().slice(0, 2000) || null,
          locationText: item.location?.trim().slice(0, 200) || null,
          startsAt,
          endsAt,
          source: "imported",
          gcalEventId: item.id,
          rsvpEnabled: false,
        })
        .onConflictDoNothing()
        .returning({ id: events.id });
      if (ok.length) result.imported++;
      else result.skippedDuplicates++;
    }
    pageToken = page.nextPageToken ?? undefined;
  } while (pageToken && result.total < MAX_IMPORT_EVENTS);
  return result;
}

/** "Test connection": reads the calendar's name using the service account. */
export async function testApiConnection(): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const cfg = apiConfig();
  if (!cfg.ok) return { ok: false, error: cfg.error };
  try {
    const cal = await client().get(cfg.calendarId);
    return { ok: true, name: cal.summary ?? cfg.calendarId };
  } catch (e) {
    return { ok: false, error: friendlyGoogleError(e) };
  }
}


