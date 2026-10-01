"use client";
import { ActionForm, SubmitButton } from "@/components/form";
import { SelectField } from "@/components/form-fields";
import type { FormState } from "@/lib/form";

/** Copy another event's shifts and things to bring onto this one (names don't come along). */
export function CopyForm({
  action,
  toEventId,
  sources,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  toEventId: string;
  sources: { value: string; label: string }[];
}) {
  return (
    <ActionForm action={action} className="space-y-3">
      <input type="hidden" name="toEventId" value={toEventId} />
      <SelectField name="fromEventId" label="Copy from" options={sources} help="Shifts keep the same time of day compared with the event's start. Nobody's name is copied." />
      <SubmitButton variant="secondary" pendingText="Copying…">Copy these spots here</SubmitButton>
    </ActionForm>
  );
}
