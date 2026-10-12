import type { Metadata } from "next";
import Link from "next/link";
import { EventForm } from "@/components/calendar/event-form";
import { requireUser } from "@/lib/auth/current-user";
import { getSettings } from "@/lib/settings";
import { defaultEventTimes } from "@/lib/events";
import { createEventAction } from "../actions";

export const metadata: Metadata = { title: "New event" };
export const dynamic = "force-dynamic";

export default async function NewEventPage() {
  await requireUser({ min: "lead" });
  const settings = await getSettings();
  const { startsAt, endsAt } = defaultEventTimes(settings.timezone);
  return (
    <div className="max-w-xl">
      <Link href="/calendar" className="text-sm md:text-[13px] text-muted underline-offset-4 hover:underline">← Calendar</Link>
      <h1 className="mb-6 mt-3 text-2xl font-semibold tracking-tight">New event</h1>
      <EventForm action={createEventAction} defaults={{ startsAt, endsAt }} tz={settings.timezone} teamDefault={settings.defaultCheckinVerification === "code" ? "code" : "none"} outreachEnabled={settings.outreachTrackingEnabled} />
    </div>
  );
}
