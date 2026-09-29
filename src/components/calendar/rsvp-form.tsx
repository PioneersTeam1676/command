"use client";
import { ActionForm, SubmitButton } from "@/components/form";
import { TextField } from "@/components/form-fields";
import type { FormState } from "@/lib/form";
import type { RsvpResponse } from "@/lib/events";

const OPTIONS: { value: RsvpResponse; label: string }[] = [
  { value: "going", label: "Going" },
  { value: "maybe", label: "Maybe" },
  { value: "cant", label: "Can't go" },
];

export function RsvpForm({
  eventId,
  current,
  reason,
  action,
}: {
  eventId: string;
  current?: RsvpResponse;
  reason?: string | null;
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
}) {
  return (
    <ActionForm action={action} className="space-y-3">
      <input type="hidden" name="eventId" value={eventId} />
      <div role="group" aria-label="Your RSVP" className="grid grid-cols-3 gap-2">
        {OPTIONS.map((o) => (
          <SubmitButton key={o.value} name="response" value={o.value} variant={current === o.value ? "primary" : "secondary"} size="lg" aria-pressed={current === o.value}>
            {o.label}
          </SubmitButton>
        ))}
      </div>
      <TextField name="reason" label="Reason (optional)" defaultValue={reason ?? ""} maxLength={300} help="Only leads and admins can see this." />
    </ActionForm>
  );
}
