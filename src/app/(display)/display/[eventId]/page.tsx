import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckInDisplay } from "@/components/display/check-in-display";
import { effectiveVerification } from "@/lib/attendance";
import { requireUser } from "@/lib/auth/current-user";
import { getEvent } from "@/lib/events";
import { getSettings } from "@/lib/settings";
import { formatInTz } from "@/lib/time";
import { uuidSchema } from "@/lib/validation";

export const metadata: Metadata = { title: "Check-in display" };
export const dynamic = "force-dynamic";

export default async function DisplayPage({ params }: { params: Promise<{ eventId: string }> }) {
  await requireUser({ min: "lead" });
  const { eventId } = await params;
  if (!uuidSchema.safeParse(eventId).success) notFound();
  const event = await getEvent(eventId);
  if (!event || event.cancelledAt) notFound();
  const settings = await getSettings();
  const tz = settings.timezone;
  return (
    <CheckInDisplay
      eventId={event.id}
      title={event.title}
      whenLabel={`${formatInTz(event.startsAt, tz, "EEE MMM d, h:mm a")} – ${formatInTz(event.endsAt, tz, "h:mm a")}`}
      mode={effectiveVerification(event, settings)}
    />
  );
}
