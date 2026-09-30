import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EventDetails } from "@/components/calendar/event-details";
import { SignupSection } from "@/components/signups/signup-section";
import { requireParent } from "@/lib/auth/current-user";
import { getEvent } from "@/lib/events";
import { approvedStudentIds } from "@/lib/parent-scope";
import { getSignupView } from "@/lib/signups";
import { getSettings } from "@/lib/settings";
import { uuidSchema } from "@/lib/validation";

export const metadata: Metadata = { title: "Event" };
export const dynamic = "force-dynamic";

export default async function ParentEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const parent = await requireParent();
  if ((await approvedStudentIds(parent.id)).length === 0) notFound();
  const { eventId } = await params;
  if (!uuidSchema.safeParse(eventId).success) notFound();
  const event = await getEvent(eventId);
  if (!event) notFound();
  const settings = await getSettings();
  const signups = await getSignupView(event.id, { id: parent.id, role: parent.role });
  return (
    <div className="space-y-6">
      <Link href="/parent/calendar" className="text-sm md:text-[13px] text-muted underline-offset-4 hover:underline">← Calendar</Link>
      <EventDetails event={event} tz={settings.timezone} />
      <SignupSection event={event} view={signups} tz={settings.timezone} staff={false} />
    </div>
  );
}
