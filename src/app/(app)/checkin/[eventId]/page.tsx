import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { attendanceSessions } from "@/db/schema";
import { ActionForm, SubmitButton } from "@/components/form";
import { TextField } from "@/components/form-fields";
import { EventDetails } from "@/components/calendar/event-details";
import { Card, CardContent } from "@/components/ui/card";
import { effectiveVerification } from "@/lib/attendance";
import { requireUser } from "@/lib/auth/current-user";
import { getEvent } from "@/lib/events";
import { getSettings } from "@/lib/settings";
import { uuidSchema } from "@/lib/validation";
import { checkInAction } from "./actions";

export const metadata: Metadata = { title: "Check in" };
export const dynamic = "force-dynamic";

/** Where the QR code lands. Signed-out members sign in first and come back here with the code still filled in. */
export default async function CheckInPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ code?: string }> }) {
  const user = await requireUser();
  const { eventId } = await params;
  const { code } = await searchParams;
  if (!uuidSchema.safeParse(eventId).success) notFound();
  const event = await getEvent(eventId);
  if (!event) notFound();
  const settings = await getSettings();
  const [existing] = await db.select().from(attendanceSessions).where(and(eq(attendanceSessions.userId, user.id), eq(attendanceSessions.eventId, eventId)));
  if (existing) redirect("/");
  const needsCode = effectiveVerification(event, settings) === "code";
  const prefill = (code ?? "").replace(/\D/g, "").slice(0, 6);

  return (
    <div className="mx-auto max-w-md space-y-6">
      <EventDetails event={event} tz={settings.timezone} />
      <Card>
        <CardContent className="p-5">
          <ActionForm action={checkInAction} className="space-y-4">
            <input type="hidden" name="eventId" value={eventId} />
            {needsCode ? (
              <TextField name="code" label="Check-in code" defaultValue={prefill} inputMode="numeric" autoComplete="one-time-code" maxLength={7} required help="Shown on the screen at the event. It changes every minute." className="[&_input]:font-mono [&_input]:text-lg [&_input]:tracking-widest" />
            ) : (
              <p className="text-sm text-muted">No code needed for this event.</p>
            )}
            <SubmitButton size="lg" className="w-full" pendingText="Checking in…">Check in</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
      <Link href="/" className="block text-center text-[13px] text-muted underline-offset-4 hover:underline">Back to Home</Link>
    </div>
  );
}
