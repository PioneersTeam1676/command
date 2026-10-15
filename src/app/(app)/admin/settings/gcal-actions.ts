"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireActionUser } from "@/lib/auth/current-user";
import { hit } from "@/lib/auth/rate-limit";
import { getEnv } from "@/lib/env";
import { friendlyGoogleError, importPastEvents, testApiConnection } from "@/lib/gcal/api";
import { fetchIcsText, icsWindow, parseIcs, runIcsSync } from "@/lib/gcal/ics";
import { assertPublicHttpUrl, UnsafeUrlError } from "@/lib/gcal/url-guard";
import { parseForm, type FormState } from "@/lib/form";
import { readSettings, updateSettings } from "@/lib/settings";

const TOO_MANY = "Too many tries. Wait a few minutes.";
const done = () => revalidatePath("/admin/settings");

/** The saved ICS address if there is one, else the one from the environment. Never shown in full: it's a secret. */
async function currentIcsUrl(): Promise<string | null> {
  return (await readSettings()).googleIcsUrl ?? getEnv().GOOGLE_CALENDAR_ICS_URL ?? null;
}

export async function saveIcsUrlAction(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireActionUser("admin");
  const p = parseForm(z.object({ url: z.string().trim().max(2000) }), formData);
  if (!p.ok) return p.state;
  if (!p.data.url) {
    await updateSettings({ googleIcsUrl: null });
    await audit({ actorId: admin.id, action: "settings.gcal_ics", targetType: "team_settings", after: { googleIcsUrl: "(removed)" } });
    done();
    return { success: "Calendar address removed." };
  }
  try {
    await assertPublicHttpUrl(p.data.url, { allowPrivate: getEnv().ICS_ALLOW_PRIVATE_NETWORKS });
  } catch (e) {
    const msg = e instanceof UnsafeUrlError ? e.message : "That address didn't work.";
    return { error: msg, fieldErrors: { url: msg } };
  }
  await updateSettings({ googleIcsUrl: p.data.url, googleCalendarLastResult: null });
  await audit({ actorId: admin.id, action: "settings.gcal_ics", targetType: "team_settings", after: { googleIcsUrl: "(set)" } }); // the URL is a secret, so it isn't logged
  done();
  return { success: "Saved. Use “Sync now” to import right away; otherwise it's checked every 10 minutes." };
}

export async function testConnectionAction(_: FormState, __: FormData): Promise<FormState> {
  const admin = await requireActionUser("admin");
  if (!(await hit(`gcal-test:${admin.id}`, 10, 600)).allowed) return { error: TOO_MANY };
  const env = getEnv();
  if (env.GOOGLE_CALENDAR_MODE === "off") return { error: "Google Calendar is turned off. Ask whoever runs your server to set GOOGLE_CALENDAR_MODE." };
  if (env.GOOGLE_CALENDAR_MODE === "api") {
    const r = await testApiConnection();
    return r.ok ? { success: `Connected to “${r.name}”.` } : { error: r.error };
  }
  const url = await currentIcsUrl();
  if (!url) return { error: "Paste your calendar's iCal address first." };
  try {
    const safe = await assertPublicHttpUrl(url, { allowPrivate: getEnv().ICS_ALLOW_PRIVATE_NETWORKS });
    const text = await fetchIcsText(safe);
    if (!/BEGIN:VCALENDAR/i.test(text)) return { error: "That address didn't return a calendar. Copy the secret or public “address in iCal format”." };
    const { timezone } = await readSettings();
    const occ = parseIcs(text, icsWindow(new Date()), timezone);
    return { success: `Connected. We can read ${occ.length} event${occ.length === 1 ? "" : "s"} (from 2 months ago to 6 months ahead).` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : friendlyGoogleError(e) };
  }
}

export async function syncNowAction(_: FormState, __: FormData): Promise<FormState> {
  const admin = await requireActionUser("admin");
  if (!(await hit(`gcal-sync:${admin.id}`, 6, 600)).allowed) return { error: TOO_MANY };
  if (getEnv().GOOGLE_CALENDAR_MODE !== "ics") return { error: "Syncing applies to ICS mode." };
  const url = await currentIcsUrl();
  if (!url) return { error: "Paste your calendar's iCal address first." };
  try {
    const r = await runIcsSync(url);
    await audit({ actorId: admin.id, action: "gcal.sync", targetType: "calendar", after: r ?? {} });
    done();
    return { success: r ? `Done. ${r.total} events: ${r.created} new, ${r.updated} changed, ${r.cancelled} removed.` : "Nothing to sync." };
  } catch (e) {
    done();
    return { error: e instanceof Error ? e.message : "Sync failed." };
  }
}

const importSchema = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a start date."), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose an end date.") });

export async function importPastAction(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireActionUser("admin");
  const p = parseForm(importSchema, formData, { keepValues: ["from", "to"] });
  if (!p.ok) return p.state;
  if (!(await hit(`gcal-import:${admin.id}`, 6, 600)).allowed) return { error: TOO_MANY };
  try {
    const r = await importPastEvents(p.data);
    await audit({ actorId: admin.id, action: "gcal.import_past", targetType: "calendar", after: { ...p.data, ...r } });
    revalidatePath("/calendar");
    done();
    return { success: `Imported ${r.imported} event${r.imported === 1 ? "" : "s"}. Skipped ${r.skippedDuplicates} already imported${r.skippedOwn ? `, ${r.skippedOwn} made in Command` : ""}${r.skippedCancelled ? `, ${r.skippedCancelled} cancelled` : ""}.`, values: p.data };
  } catch (e) {
    return { error: e instanceof Error ? friendlyGoogleError(e) : "Import failed.", values: p.data };
  }
}
