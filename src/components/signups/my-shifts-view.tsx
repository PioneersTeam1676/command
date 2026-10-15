import Link from "next/link";
import { ClipboardList, MapPin } from "lucide-react";
import { SlotButton } from "@/components/signups/slot-button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { leaveSlotAction } from "@/app/(app)/calendar/signup-actions";
import type { MyShift, OpenShift } from "@/lib/my-shifts";
import { formatInTz } from "@/lib/time";

/** "With Ada, Ben and 2 more" or "Signed up: ...". When names aren't shown (parents), just the count. */
export function whoText(label: "With" | "Signed up", names: string[], total: number): string {
  if (names.length === 0) return label === "With" ? `${total} ${total === 1 ? "other" : "others"} signed up` : `${total} signed up`;
  const rest = total - names.length;
  const list = rest > 0 ? `${names.join(", ")} and ${rest} more` : names.join(", ");
  return label === "With" ? `With ${list}` : `Signed up: ${list}`;
}

export function shiftWhen(s: { startsAt: Date; endsAt: Date }, tz: string) {
  const sameDay = formatInTz(s.startsAt, tz, "yyyy-MM-dd") === formatInTz(s.endsAt, tz, "yyyy-MM-dd");
  return `${formatInTz(s.startsAt, tz, "EEE MMM d, h:mm a")} – ${sameDay ? formatInTz(s.endsAt, tz, "h:mm a") : formatInTz(s.endsAt, tz, "EEE MMM d, h:mm a")}`;
}

/** The list part of "My shifts": what you hold, what you could still take, and what you've done. */
export function MyShiftsView({ upcoming, past, open, tz, eventHref }: { upcoming: MyShift[]; past: MyShift[]; open: OpenShift[]; tz: string; eventHref: (eventId: string) => string }) {
  return (
    <div className="space-y-8">
      <section aria-labelledby="mine-h">
        <h2 id="mine-h" className="mb-3 text-base font-semibold tracking-tight">Coming up</h2>
        {upcoming.length === 0 ? (
          <EmptyState icon={<ClipboardList aria-hidden />} title="No shifts yet">
            {open.length > 0 ? "Pick one from “Shifts you can take” below." : "When your team opens sign-ups, the shifts you sign up for will show here."}
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {upcoming.map((m) => (
              <li key={m.entryId} className="space-y-3 rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-[15px] font-medium">{m.slot.title}</p>
                    <Link href={eventHref(m.eventId)} className="text-sm md:text-[13px] text-muted underline-offset-4 hover:underline">{m.eventTitle}</Link>
                    <p className="font-mono text-sm md:text-[13px] text-muted">{shiftWhen(m.slot, tz)}</p>
                    {m.locationText ? <p className="flex items-center gap-1.5 text-sm md:text-[13px] text-muted"><MapPin className="size-3.5" aria-hidden />{m.locationText}</p> : null}
                    {m.others > 0 ? <p className="text-sm md:text-[13px] text-muted">{whoText("With", m.withNames, m.others)}</p> : null}
                  </div>
                  {m.status === "waitlisted" ? <Badge tone="warning">Waitlist · number {m.position}</Badge> : <Badge tone="success">You&apos;re on it</Badge>}
                </div>
                {m.canLeave ? (
                  <SlotButton action={leaveSlotAction} slotId={m.slot.id} eventId={m.eventId} label={m.status === "waitlisted" ? "Leave the waitlist" : "Leave this shift"} variant="secondary" />
                ) : (
                  <p className="text-sm md:text-[13px] text-muted">Can&apos;t change this one yourself any more. Ask a lead if your plans change.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {open.length > 0 ? (
        <section aria-labelledby="open-h">
          <h2 id="open-h" className="mb-3 text-base font-semibold tracking-tight">Shifts you can take</h2>
          <ul className="space-y-2">
            {open.slice(0, 25).map((o) => (
              <li key={o.slot.id}>
                <Link href={eventHref(o.eventId)} className="flex flex-col gap-1 rounded-lg border p-3 transition-colors duration-150 hover:bg-surface md:flex-row md:items-center md:justify-between">
                  <span className="min-w-0">
                    <span className="block font-medium">{o.slot.title} <span className="font-normal text-muted">· {o.eventTitle}</span></span>
                    <span className="block font-mono text-[13px] md:text-xs text-muted">{shiftWhen(o.slot, tz)}</span>
                    {o.filled > 0 ? <span className="block text-[13px] text-muted md:text-xs">{whoText("Signed up", o.names, o.filled)}</span> : null}
                  </span>
                  <Badge tone={o.waitlist ? "warning" : "info"}>{o.waitlist ? "Full · waitlist" : `${o.spotsLeft} ${o.spotsLeft === 1 ? "place" : "places"} left`}</Badge>
                </Link>
              </li>
            ))}
          </ul>
          {open.length > 25 ? <p className="mt-2 text-sm md:text-[13px] text-muted">And {open.length - 25} more on the calendar.</p> : null}
        </section>
      ) : null}

      {past.length > 0 ? (
        <section aria-labelledby="past-h">
          <details>
            <summary id="past-h" className="cursor-pointer text-base font-semibold tracking-tight">Past shifts ({past.length})</summary>
            <ul className="mt-3 divide-y rounded-lg border">
              {past.map((m) => (
                <li key={m.entryId} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0">{m.slot.title} <span className="text-muted">· {m.eventTitle}</span></span>
                  <span className="font-mono text-[13px] md:text-xs text-muted">{formatInTz(m.slot.startsAt, tz, "MMM d, h:mm a")}</span>
                </li>
              ))}
            </ul>
          </details>
        </section>
      ) : null}
    </div>
  );
}
