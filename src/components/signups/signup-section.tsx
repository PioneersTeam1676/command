import { ClipboardList, Lock, Star, Users } from "lucide-react";
import { ConfirmAction } from "@/components/confirm-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SlotButton } from "@/components/signups/slot-button";
import { BulkForm } from "@/components/signups/bulk-form";
import { CopyForm } from "@/components/signups/copy-form";
import { SlotForm } from "@/components/signups/slot-form";
import { addSlotAction, addSlotsBulkAction, cancelSlotAction, copySheetAction, claimSlotAction, createSheetAction, leaveSlotAction, toggleSheetAction, updateSlotAction } from "@/app/(app)/calendar/signup-actions";
import type { EventRow } from "@/lib/events";
import type { SignupView, SlotView } from "@/lib/signups";
import { AUDIENCE_LABEL, CLOSED_MESSAGE } from "@/lib/signups-rules";
import { formatInTz, toDatetimeLocal } from "@/lib/time";

function slotTime(s: SlotView["slot"], tz: string) {
  const sameDay = formatInTz(s.startsAt, tz, "yyyy-MM-dd") === formatInTz(s.endsAt, tz, "yyyy-MM-dd");
  return `${formatInTz(s.startsAt, tz, "EEE MMM d, h:mm a")} – ${sameDay ? formatInTz(s.endsAt, tz, "h:mm a") : formatInTz(s.endsAt, tz, "EEE MMM d, h:mm a")}`;
}

function Slot({ v, event, tz, staff, groups }: { v: SlotView; event: EventRow; tz: string; staff: boolean; groups: { id: string; name: string }[] }) {
  const { slot } = v;
  const item = slot.kind === "item";
  const full = v.filled >= slot.capacity;
  const cancelled = Boolean(slot.cancelledAt);
  const groupNames = v.groups.map((g) => g.name).join(", ");
  return (
    <li className="space-y-3 rounded-[8px] border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className={`text-[15px] font-medium ${cancelled ? "text-muted line-through" : ""}`}>{slot.title}</p>
          {item ? null : <p className="font-mono text-sm md:text-[13px] text-muted">{slotTime(slot, tz)}</p>}
          {slot.description ? <p className="text-sm md:text-[13px] text-foreground/90">{slot.description}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {cancelled ? <Badge tone="error">Cancelled</Badge> : null}
          {slot.audience !== "anyone" ? <Badge tone="info">{AUDIENCE_LABEL[slot.audience]}</Badge> : null}
          {v.groups.length > 0 ? <Badge tone="accent"><Star className="size-3" aria-hidden />{groupNames}</Badge> : null}
          <Badge tone={full ? "warning" : "success"}>
            <Users className="size-3" aria-hidden />
            {v.filled} of {slot.capacity}{item ? " claimed" : ""}
            {full ? (item ? " · Covered" : " · Full") : ""}
          </Badge>
          {v.waitlisted > 0 ? <Badge>{v.waitlisted} waiting</Badge> : null}
        </div>
      </div>

      {!cancelled ? (
        v.mine ? (
          v.closed ? (
            <p className="text-sm md:text-[13px] text-muted">{v.mine.status === "waitlisted" ? "You're on the waitlist. " : "You're signed up. "}{CLOSED_MESSAGE[v.closed]}</p>
          ) : v.mine.status === "waitlisted" ? (
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone="warning">On the waitlist · number {v.myPosition}</Badge>
              <SlotButton action={leaveSlotAction} slotId={slot.id} eventId={event.id} label="Leave the waitlist" variant="secondary" />
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone="success">{item ? "You're bringing this" : "You're signed up"}</Badge>
              <SlotButton action={leaveSlotAction} slotId={slot.id} eventId={event.id} label={item ? "I can't bring this" : "Leave this shift"} variant="secondary" />
            </div>
          )
        ) : v.closed ? (
          <p className="text-sm md:text-[13px] text-muted">{CLOSED_MESSAGE[v.closed]}</p>
        ) : v.gate.state === "early_access" ? (
          <p className="text-sm md:text-[13px] text-muted">
            <strong className="text-foreground">{groupNames}</strong> {v.groups.length === 1 ? "has" : "have"} first pick. Opens to everyone {formatInTz(v.gate.opensAt, tz, "EEE MMM d 'at' h:mm a")}.
          </p>
        ) : v.gate.state === "group_only" ? (
          <p className="text-sm md:text-[13px] text-muted">Reserved for {groupNames}. Only they can sign up.</p>
        ) : full ? (
          slot.waitlistEnabled ? (
            <div className="space-y-1">
              <SlotButton action={claimSlotAction} slotId={slot.id} eventId={event.id} label="Join the waitlist" variant="secondary" />
              <p className="text-sm md:text-[13px] text-muted">It&apos;s full. If someone drops out, the next person in line gets the place.</p>
            </div>
          ) : (
            <p className="text-sm md:text-[13px] text-muted">{item ? "Someone is already bringing this." : "This shift is full."}</p>
          )
        ) : (
          <SlotButton action={claimSlotAction} slotId={slot.id} eventId={event.id} label={item ? "I'll bring this" : "Sign up"} withNote />
        )
      ) : null}

      {v.queue && v.queue.length > 0 ? (
        <p className="text-sm md:text-[13px] text-muted">
          <span className="font-medium text-foreground">Waitlist:</span> {v.queue.map((q, i) => `${i + 1}. ${q.name}`).join(", ")}
        </p>
      ) : null}

      {v.roster && v.roster.length > 0 ? (
        <p className="text-sm md:text-[13px] text-muted">
          <span className="font-medium text-foreground">{item ? "Bringing:" : "Signed up:"}</span> {v.roster.map((r) => (r.note ? `${r.name} (${r.note})` : r.name)).join(", ")}
        </p>
      ) : null}

      {staff && !cancelled ? (
        <div className="flex flex-wrap items-start gap-2 border-t pt-3">
          <details className="w-full">
            <summary className="cursor-pointer text-sm md:text-[13px] text-muted hover:text-foreground">{item ? "Edit this item" : "Edit this shift"}</summary>
            <div className="mt-3">
              <SlotForm
                action={updateSlotAction}
                hidden={{ slotId: slot.id, eventId: event.id }}
                tz={tz}
                submitLabel="Save changes"
                groups={groups}
                lockKind
                defaults={{
                  kind: slot.kind === "item" ? "item" : "shift",
                  title: slot.title,
                  description: slot.description ?? "",
                  startsAt: toDatetimeLocal(slot.startsAt, tz),
                  endsAt: toDatetimeLocal(slot.endsAt, tz),
                  capacity: slot.capacity,
                  audience: slot.audience,
                  groupIds: v.groups.map((g) => g.id),
                  opensToAllAt: slot.opensToAllAt ? toDatetimeLocal(slot.opensToAllAt, tz) : "",
                  waitlistEnabled: slot.waitlistEnabled,
                }}
              />
            </div>
          </details>
          <ConfirmAction
            label={item ? "Remove item" : "Cancel shift"}
            danger
            title={`${item ? "Remove" : "Cancel"} “${slot.title}”?`}
            description={v.filled > 0 ? `${v.filled} ${v.filled === 1 ? "person is" : "people are"} signed up. They'll all get a notification. This can't be undone.` : "Nobody has signed up yet. This can't be undone."}
            confirmLabel={item ? "Remove item" : "Cancel shift"}
            action={cancelSlotAction}
            fields={{ slotId: slot.id, eventId: event.id }}
          />
        </div>
      ) : null}
    </li>
  );
}

/**
 * Shifts and things to bring on an event page (the "I'm going" spot has its own card). Members and parents see what they
 * may take; leads and admins also see cancelled spots and get the controls to build, copy and close the sheet.
 */
export function SignupSection({
  event,
  view,
  tz,
  staff,
  groups = [],
  copySources = [],
}: {
  event: EventRow;
  view: SignupView | null;
  tz: string;
  staff: boolean;
  groups?: { id: string; name: string }[];
  copySources?: { value: string; label: string }[];
}) {
  const spots = view?.slots.filter((v) => v.slot.kind !== "attend") ?? [];
  if (!view || (spots.length === 0 && !staff) || (staff && event.cancelledAt && spots.length === 0)) {
    if (!staff || event.cancelledAt) return null;
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ClipboardList className="size-4" aria-hidden />Need helpers?</CardTitle>
          <CardDescription>Set up shifts (pit crew, a booth) or things to bring (drinks, a table). People pick their spots, you see who&apos;s covered.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createSheetAction}>
            <input type="hidden" name="eventId" value={event.id} />
            <Button type="submit" variant="secondary">Add shifts or things to bring</Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  const { sheet } = view;
  const closed = Boolean(sheet.closedAt);
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2"><ClipboardList className="size-4" aria-hidden />Shifts &amp; things to bring</CardTitle>
          {closed ? <Badge tone="warning"><Lock className="size-3" aria-hidden />Closed</Badge> : null}
        </div>
        {sheet.description ? <CardDescription>{sheet.description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {spots.length === 0 ? (
          <EmptyState icon={<ClipboardList aria-hidden />} title="Nothing here yet">
            Add the first shift or item below.
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {spots.map((v) => <Slot key={v.slot.id} v={v} event={event} tz={tz} staff={staff} groups={groups} />)}
          </ul>
        )}

        {staff && !event.cancelledAt ? (
          <div className="space-y-3 border-t pt-4">
            <details>
              <summary className="cursor-pointer text-sm font-medium">Add one shift or item</summary>
              <div className="mt-3">
                <SlotForm
                  action={addSlotAction}
                  hidden={{ sheetId: sheet.id, eventId: event.id }}
                  tz={tz}
                  submitLabel="Add"
                  groups={groups}
                  resetOnSuccess
                  defaults={{ startsAt: toDatetimeLocal(event.startsAt, tz), endsAt: toDatetimeLocal(event.endsAt, tz) }}
                />
              </div>
            </details>
            <details>
              <summary className="cursor-pointer text-sm font-medium">Add many shifts at once</summary>
              <div className="mt-3">
                <BulkForm action={addSlotsBulkAction} hidden={{ sheetId: sheet.id, eventId: event.id }} tz={tz} defaults={{ startsAt: toDatetimeLocal(event.startsAt, tz), endsAt: toDatetimeLocal(event.endsAt, tz) }} />
              </div>
            </details>
            {copySources.length > 0 ? (
              <details>
                <summary className="cursor-pointer text-sm font-medium">Copy from another event</summary>
                <div className="mt-3">
                  <CopyForm action={copySheetAction} toEventId={event.id} sources={copySources} />
                </div>
              </details>
            ) : null}
            <form action={toggleSheetAction}>
              <input type="hidden" name="sheetId" value={sheet.id} />
              <input type="hidden" name="eventId" value={event.id} />
              <input type="hidden" name="closed" value={closed ? "false" : "true"} />
              <Button type="submit" variant="ghost" size="sm">{closed ? "Reopen sign-ups" : "Close sign-ups"}</Button>
            </form>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
