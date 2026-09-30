"use client";
import { ActionForm, SubmitButton } from "@/components/form";
import { SelectField, TextAreaField, TextField } from "@/components/form-fields";
import type { FormState } from "@/lib/form";
import { AUDIENCE_LABEL } from "@/lib/signups-rules";

export type SlotFormDefaults = {
  title?: string;
  description?: string;
  startsAt: string;
  endsAt: string;
  capacity?: number;
  audience?: string;
  groupIds?: string[];
  opensToAllAt?: string;
};

/** Add or edit one shift. `hidden` carries the ids (sheetId/eventId, or slotId/eventId when editing). */
export function SlotForm({
  action,
  hidden,
  defaults,
  tz,
  submitLabel,
  groups = [],
  resetOnSuccess = false,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  hidden: Record<string, string>;
  defaults: SlotFormDefaults;
  tz: string;
  submitLabel: string;
  /** Every group an admin has made. Empty hides the group controls. */
  groups?: { id: string; name: string }[];
  resetOnSuccess?: boolean;
}) {
  return (
    <ActionForm action={action} className="space-y-4" resetOnSuccess={resetOnSuccess}>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <TextField name="title" label="Shift name" defaultValue={defaults.title} required maxLength={120} help="For example: Pit crew, Scouting, Booth greeter." />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="startsAt" label="Starts" type="datetime-local" defaultValue={defaults.startsAt} required help={`In ${tz}`} />
        <TextField name="endsAt" label="Ends" type="datetime-local" defaultValue={defaults.endsAt} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="capacity" label="People needed" type="number" inputMode="numeric" min={1} max={500} defaultValue={String(defaults.capacity ?? 2)} required />
        <SelectField
          name="audience"
          label="Who can sign up?"
          defaultValue={defaults.audience ?? "anyone"}
          options={(["anyone", "members", "parents"] as const).map((v) => ({ value: v, label: AUDIENCE_LABEL[v] }))}
        />
      </div>
      {groups.length > 0 ? (
        <fieldset className="space-y-3 rounded-[8px] border p-3">
          <legend className="px-1 text-sm font-medium">Reserve for a group (optional)</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {groups.map((g) => (
              <label key={g.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="groupIds" value={g.id} defaultChecked={defaults.groupIds?.includes(g.id)} className="size-4 accent-[var(--accent)]" />
                {g.name}
              </label>
            ))}
          </div>
          <TextField
            name="opensToAllAt"
            label="Open to everyone at (optional)"
            type="datetime-local"
            defaultValue={defaults.opensToAllAt}
            help={`In ${tz}. Until then only the chosen groups can sign up. Leave blank to keep this shift just for them.`}
          />
        </fieldset>
      ) : null}
      <TextAreaField name="description" label="Details (optional)" defaultValue={defaults.description} maxLength={1000} rows={2} />
      <SubmitButton pendingText="Saving…">{submitLabel}</SubmitButton>
    </ActionForm>
  );
}
