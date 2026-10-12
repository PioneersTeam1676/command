import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EventForm } from "@/components/calendar/event-form";
import { requireUser } from "@/lib/auth/current-user";
import { getEvent } from "@/lib/events";
import { getSettings } from "@/lib/settings";
import { toDatetimeLocal } from "@/lib/time";
import { uuidSchema } from "@/lib/validation";
import { updateEventAction } from "../../actions";

export const metadata: Metadata = { title: "Edit event" };
export const dynamic = "force-dynamic";

export default async function EditEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  await requireUser({ min: "lead" });
  const { eventId } = await params;
  if (!uuidSchema.safeParse(eventId).success) notFound();
  const event = await getEvent(eventId);
  if (!event) notFound();
  const settings = await getSettings();
  return (
    <div className="max-w-xl">
      <Link href={`/calendar/${event.id}`} className="text-sm md:text-[13px] text-muted underline-offset-4 hover:underline">← Back to event</Link>
      <h1 className="mb-6 mt-3 text-2xl font-semibold tracking-tight">Edit event</h1>
      <EventForm
        action={updateEventAction}
        tz={settings.timezone}
        verificationOnly={event.source === "imported"}
        teamDefault={settings.defaultCheckinVerification === "code" ? "code" : "none"}
        outreachEnabled={settings.outreachTrackingEnabled}
        defaults={{
          id: event.id,
          title: event.title,
          description: event.description ?? "",
          locationText: event.locationText ?? "",
          startsAt: toDatetimeLocal(event.startsAt, settings.timezone),
          endsAt: toDatetimeLocal(event.endsAt, settings.timezone),
          verification: event.verification,
          rsvpEnabled: event.rsvpEnabled,
          isOutreach: event.isOutreach,
        }}
      />
    </div>
  );
}
