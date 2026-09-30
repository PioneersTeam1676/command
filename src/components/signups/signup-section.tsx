import { ClipboardList, Lock, Users } from "lucide-react";
import { ConfirmAction } from "@/components/confirm-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SlotButton } from "@/components/signups/slot-button";
import { SlotForm } from "@/components/signups/slot-form";
import { addSlotAction, cancelSlotAction, claimSlotAction, createSheetAction, leaveSlotAction, toggleSheetAction, updateSlotAction } from "@/app/(app)/calendar/signup-actions";
import type { EventRow } from "@/lib/events";
import type { SignupView, SlotView } from "@/lib/signups";
import { AUDIENCE_LABEL, CLOSED_MESSAGE } from "@/lib/signups-rules";
import { formatInTz, toDatetimeLocal } from "@/lib/time";

function slotTime(s: SlotView["slot"], tz: string) {
  const sameDay = formatInTz(s.startsAt, tz, "yyyy-MM-dd") === formatInTz(s.endsAt, tz, "yyyy-MM-dd");
  return `${formatInTz(s.startsAt, tz, "EEE MMM d, h:mm a")} – ${sameDay ? formatInTz(s.endsAt, tz, "h:mm a") : formatInTz(s.endsAt, tz, "EEE MMM d, h:mm a")}`;
}

function Slot({ v, event, tz, staff }: { v: SlotView; event: EventRow; tz: string; staff: boolean }) {
  const { slot } = v;
  const full = v.filled >= slot.capacity;
  const cancelled = Boolean(slot.cancelledAt);
  return (
    <li className="space-y-3 rounded-[8px] border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className={`text-[15px] font-medium ${cancelled ? "text-muted line-through" : ""}`}>{slot.title}</p>
          <p className="font-mono text-sm md:text-[13px] text-muted">{slotTime(slot, tz)}</p>
          {slot.description ? <p className="text-sm md:text-[13px] text-foreground/90">{slot.description}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {cancelled ? <Badge tone="error">Cancelled</Badge> : null}
          {slot.audience !== "anyone" ? <Badge tone="info">{AUDIENCE_LABEL[slot.audience]}</Badge> : null}
          <Badge tone={full ? "warning" : "success"}>
            <Users className="size-3" aria-hidden />
            {v.filled} of {slot.capacity}
            {full ? " · Full" : ""}
          </Badge>
        </div>
      </div>

      {!cancelled ? (
        v.closed ? (
          <p className="text-sm md:text-[13px] text-muted">{v.mine ? "You're signed up. " : ""}{CLOSED_MESSAGE[v.closed]}</p>
        ) : v.mine ? (
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="success">You&apos;re signed up</Badge>
            <SlotButton action={leaveSlotAction} slotId={slot.id} eventId={event.id} label="Leave this shift" variant="secondary" />
          </div>
        ) : full ? (
          <p className="text-sm md:text-[13px] text-muted">This shift is full.</p>
        ) : (
          <SlotButton action={claimSlotAction} slotId={slot.id} eventId={event.id} label="Sign up" />
        )
      ) : null}

      {v.roster && v.roster.length > 0 ? (
        <p className="text-sm md:text-[13px] text-muted">
          <span className="font-medium text-foreground">Signed up:</span> {v.roster.map((r) => r.name).join(", ")}
        </p>
      ) : null}

      {staff && !cancelled ? (
        <div className="flex flex-wrap items-start gap-2 border-t pt-3">
          <details className="w-full">
            <summary className="cursor-pointer text-sm md:text-[13px] text-muted hover:text-foreground">Edit this shift</summary>
            <div className="mt-3">
              <SlotForm
                action={updateSlotAction}
                hidden={{ slotId: slot.id, eventId: event.id }}
                tz={tz}
                submitLabel="Save changes"
                defaults={{ title: slot.title, description: slot.description ?? "", startsAt: toDatetimeLocal(slot.startsAt, tz), endsAt: toDatetimeLocal(slot.endsAt, tz), capacity: slot.capacity, audience: slot.audience }}
              />
            </div>
          </details>
          <ConfirmAction
            label="Cancel shift"
            danger
            title={`Cancel “${slot.title}”?`}
            description={v.filled > 0 ? `${v.filled} ${v.filled === 1 ? "person is" : "people are"} signed up. They'll all get a notification. This can't be undone.` : "Nobody has signed up yet. This can't be undone."}
            confirmLabel="Cancel shift"
            action={cancelSlotAction}
            fields={{ slotId: slot.id, eventId: event.id }}
          />
        </div>
      ) : null}
    </li>
  );
}

/**
 * The sign-up sheet on an event page. Members and parents see the shifts they may take; leads and
 * admins also see cancelled shifts and get the controls to build and close the sheet.
 */
export function SignupSection({ event, view, tz, staff }: { event: EventRow; view: SignupView | null; tz: string; staff: boolean }) {
  if (!view) {
    if (!staff || event.cancelledAt) return null;
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ClipboardList className="size-4" aria-hidden />Sign-ups</CardTitle>
          <CardDescription>Need people for shifts, like pit crew or a booth? Add a sign-up sheet and let the team and parents pick their spots.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createSheetAction}>
            <input type="hidden" name="eventId" value={event.id} />
            <Button type="submit" variant="secondary">Add a sign-up sheet</Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  const { sheet, slots } = view;
  const closed = Boolean(sheet.closedAt);
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2"><ClipboardList className="size-4" aria-hidden />{sheet.title}</CardTitle>
          {closed ? <Badge tone="warning"><Lock className="size-3" aria-hidden />Closed</Badge> : null}
        </div>
        {sheet.description ? <CardDescription>{sheet.description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {slots.length === 0 ? (
          <EmptyState icon={<ClipboardList aria-hidden />} title="No shifts yet">
            {staff ? "Add the first shift below." : "Check back soon. Shifts you can take will show up here."}
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {slots.map((v) => <Slot key={v.slot.id} v={v} event={event} tz={tz} staff={staff} />)}
          </ul>
        )}

        {staff && !event.cancelledAt ? (
          <div className="space-y-3 border-t pt-4">
            <details>
              <summary className="cursor-pointer text-sm font-medium">Add a shift</summary>
              <div className="mt-3">
                <SlotForm
                  action={addSlotAction}
                  hidden={{ sheetId: sheet.id, eventId: event.id }}
                  tz={tz}
                  submitLabel="Add shift"
                  resetOnSuccess
                  defaults={{ startsAt: toDatetimeLocal(event.startsAt, tz), endsAt: toDatetimeLocal(event.endsAt, tz) }}
                />
              </div>
            </details>
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
