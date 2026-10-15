import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarClock, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getPublicShiftView, signupUrl } from "@/lib/signups";
import { getSettings } from "@/lib/settings";
import { formatInTz } from "@/lib/time";
import { uuidSchema } from "@/lib/validation";

export const metadata: Metadata = { title: "Shifts", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * The page behind "Share these shifts". Open to anyone with the link, read only: what the event is and how many places
 * are taken on each shift, never who. Signed-in people go straight to the event, where they can sign up.
 */
export default async function PublicShiftsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  if (!uuidSchema.safeParse(eventId).success) notFound();
  const user = await getCurrentUser();
  if (user && user.status === "active" && !user.mustChangePassword) redirect(signupUrl(user.role, eventId));
  const view = await getPublicShiftView(eventId);
  if (!view) notFound();
  const settings = await getSettings();
  const tz = settings.timezone;
  const { event } = view;
  // Back to this page after signing in: it sends each role to the right place (members and parents have different event pages).
  const signIn = `/login?next=${encodeURIComponent(`/shifts/${eventId}`)}`;
  const sameDay = formatInTz(event.startsAt, tz, "yyyy-MM-dd") === formatInTz(event.endsAt, tz, "yyyy-MM-dd");

  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-16 pt-8 md:pt-14">
      <p className="mb-8 flex items-center gap-2.5 font-semibold tracking-tight">
        {settings.logoPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/api/logo" alt="" className="size-7 rounded-md object-cover" />
        ) : (
          <span aria-hidden className="grid size-7 place-items-center rounded-md bg-accent text-[13px] text-accent-fg">{settings.name.slice(0, 1).toUpperCase()}</span>
        )}
        {settings.name}
      </p>

      <h1 className="break-words text-xl font-semibold leading-snug tracking-tight [overflow-wrap:anywhere] md:text-2xl">{event.title}</h1>
      <dl className="mt-4 space-y-3 text-[15px]">
        <div className="flex items-start gap-3">
          <dt className="sr-only">When</dt>
          <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          <dd>
            <span className="block font-medium">{formatInTz(event.startsAt, tz, "EEEE, MMMM d")}</span>
            <span className="block font-mono text-sm text-muted md:text-[13px]">
              {formatInTz(event.startsAt, tz, "h:mm a")} – {sameDay ? formatInTz(event.endsAt, tz, "h:mm a") : formatInTz(event.endsAt, tz, "EEE MMM d, h:mm a")} ({formatInTz(event.startsAt, tz, "zzz")})
            </span>
          </dd>
        </div>
        {event.locationText ? (
          <div className="flex items-start gap-3">
            <dt className="sr-only">Where</dt>
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
            <dd className="min-w-0 break-words [overflow-wrap:anywhere]">{event.locationText}</dd>
          </div>
        ) : null}
      </dl>

      {event.cancelled ? (
        <p role="status" className="mt-8 rounded-lg border bg-surface p-4 text-sm">This event was cancelled.</p>
      ) : (
        <section aria-labelledby="shifts-h" className="mt-8">
          <h2 id="shifts-h" className="mb-3 text-base font-semibold tracking-tight">Shifts</h2>
          {view.slots.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted">Nothing to sign up for right now.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {view.slots.map((s) => (
                <li key={s.id} className="flex flex-col gap-1.5 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium [overflow-wrap:anywhere]">{s.title}</p>
                    <p className="font-mono text-[13px] text-muted md:text-[12px]">
                      {formatInTz(s.startsAt, tz, "EEE MMM d, h:mm a")} – {formatInTz(s.endsAt, tz, "h:mm a")}
                    </p>
                  </div>
                  <Badge tone={s.full ? "neutral" : "info"}>{s.full ? (s.waitlist ? "Full, waitlist open" : "Full") : `${s.filled} of ${s.capacity} signed up`}</Badge>
                </li>
              ))}
            </ul>
          )}
          {view.closed ? <p className="mt-3 text-sm text-muted md:text-[13px]">Sign-ups are closed. Ask a lead if your plans change.</p> : null}
        </section>
      )}

      {event.cancelled ? null : (
        <div className="mt-8 space-y-2">
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href={signIn}>Sign in to sign up</Link>
          </Button>
          <p className="text-sm text-muted md:text-[13px]">Team members sign in to pick a shift. Parents sign in to see their student&apos;s calendar.</p>
        </div>
      )}
    </main>
  );
}
