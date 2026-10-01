"use client";
import { ActionForm, SubmitButton } from "@/components/form";
import { SelectField, TextField } from "@/components/form-fields";
import type { FormState } from "@/lib/form";
import { AUDIENCE_LABEL } from "@/lib/signups-rules";

/** "Every 2 hours from 9 to 5": one form that makes a whole run of back-to-back shifts. */
export function BulkForm({
  action,
  hidden,
  tz,
  defaults,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  hidden: Record<string, string>;
  tz: string;
  defaults: { startsAt: string; endsAt: string };
}) {
  return (
    <ActionForm action={action} className="space-y-4" resetOnSuccess>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <TextField name="title" label="Shift name" required maxLength={120} help="Every shift gets this name. For example: Pit crew." />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="startsAt" label="First shift starts" type="datetime-local" defaultValue={defaults.startsAt} required help={`In ${tz}`} />
        <TextField name="endsAt" label="Last shift ends" type="datetime-local" defaultValue={defaults.endsAt} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          name="minutes"
          label="Each shift is"
          defaultValue="120"
          options={[{ value: "30", label: "30 minutes" }, { value: "60", label: "1 hour" }, { value: "90", label: "1.5 hours" }, { value: "120", label: "2 hours" }, { value: "180", label: "3 hours" }, { value: "240", label: "4 hours" }]}
        />
        <TextField name="capacity" label="People per shift" type="number" inputMode="numeric" min={1} max={500} defaultValue="2" required />
        <SelectField name="audience" label="Who can sign up?" defaultValue="anyone" options={(["anyone", "members", "parents"] as const).map((v) => ({ value: v, label: AUDIENCE_LABEL[v] }))} />
      </div>
      <SubmitButton pendingText="Adding…">Add all the shifts</SubmitButton>
    </ActionForm>
  );
}
