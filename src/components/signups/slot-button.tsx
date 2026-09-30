"use client";
import { ActionForm, SubmitButton } from "@/components/form";
import type { FormState } from "@/lib/form";

/** One-button form for "Sign up" / "Leave". Shows the server's reason inline when it's refused (full, overlap...). */
export function SlotButton({
  action,
  slotId,
  eventId,
  label,
  variant = "primary",
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  slotId: string;
  eventId: string;
  label: string;
  variant?: "primary" | "secondary";
}) {
  return (
    <ActionForm action={action} className="space-y-2">
      <input type="hidden" name="slotId" value={slotId} />
      <input type="hidden" name="eventId" value={eventId} />
      <SubmitButton variant={variant} size="md" pendingText="Working…">{label}</SubmitButton>
    </ActionForm>
  );
}
