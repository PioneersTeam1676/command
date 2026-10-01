"use client";
import { ActionForm, SubmitButton } from "@/components/form";
import { TextField } from "@/components/form-fields";
import type { FormState } from "@/lib/form";

/**
 * One-button form for "Sign up" / "Leave". Shows the server's reason inline when it's refused (full, overlap...).
 * With `withNote` it also offers an optional note, like SignupGenius's comment box.
 */
export function SlotButton({
  action,
  slotId,
  eventId,
  label,
  variant = "primary",
  withNote = false,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  slotId: string;
  eventId: string;
  label: string;
  variant?: "primary" | "secondary";
  withNote?: boolean;
}) {
  return (
    <ActionForm action={action} className="space-y-2">
      <input type="hidden" name="slotId" value={slotId} />
      <input type="hidden" name="eventId" value={eventId} />
      {withNote ? <TextField name="note" label="Note (optional)" maxLength={200} help="Only leads and admins see it. For example: “I can bring the big cooler.”" /> : null}
      <SubmitButton variant={variant} size="md" pendingText="Working…">{label}</SubmitButton>
    </ActionForm>
  );
}
