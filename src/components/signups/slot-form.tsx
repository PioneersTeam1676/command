"use client";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/form";
import { SelectField, TextAreaField, TextField } from "@/components/form-fields";
import type { FormState } from "@/lib/form";
import { AUDIENCE_LABEL } from "@/lib/signups-rules";

export type SlotFormDefaults = {
  kind?: "shift" | "item";
  title?: string;
  description?: string;
  startsAt: string;
  endsAt: string;
  capacity?: number;
  audience?: string;
  groupIds?: string[];
  opensToAllAt?: string;
  waitlistEnabled?: boolean;
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
  lockKind = false,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  hidden: Record<string, string>;
  defaults: SlotFormDefaults;
  tz: string;
  submitLabel: string;
  /** Every group an admin has made. Empty hides the group controls. */
  groups?: { id: string; name: string }[];
  resetOnSuccess?: boolean;
  /** When editing, a shift stays a shift and an item stays an item. */
  lockKind?: boolean;
}) {
  const [kind, setKind] = useState<"shift" | "item">(defaults.kind ?? "shift");
  const item = kind === "item";
  return (
    <ActionForm action={action} className="space-y-4" resetOnSuccess={resetOnSuccess}>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <input type="hidden" name="kind" value={kind} />
      {lockKind ? null : (
        <fieldset className="flex flex-wrap gap-2" aria-label="What kind of spot is this?">
          {([["shift", "A shift (a time to be there)"], ["item", "Something to bring"]] as const).map(([v, l]) => (
            <label key={v} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 text-[13px] ${kind === v ? "border-foreground font-medium" : "text-muted hover:bg-hover"}`}>
              <input type="radio" name="kindChoice" value={v} checked={kind === v} onChange={() => setKind(v)} className="sr-only" />
              {l}
            </label>
          ))}
        </fieldset>
      )}
      <TextField name="title" label={item ? "What to bring" : "Shift name"} defaultValue={defaults.title} required maxLength={120} help={item ? "For example: Drinks, Paper plates, Folding table." : "For example: Pit crew, Scouting, Booth greeter."} />
      {item ? null : (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField name="startsAt" label="Starts" type="datetime-local" defaultValue={defaults.startsAt} required help={`In ${tz}`} />
          <TextField name="endsAt" label="Ends" type="datetime-local" defaultValue={defaults.endsAt} required />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="capacity" label={item ? "How many are needed" : "People needed"} type="number" inputMode="numeric" min={1} max={500} defaultValue={String(defaults.capacity ?? 2)} required help={item ? "Each person who signs up brings one." : undefined} />
        <SelectField
          name="audience"
          label="Who can sign up?"
          defaultValue={defaults.audience ?? "anyone"}
          options={(["anyone", "members", "parents"] as const).map((v) => ({ value: v, label: AUDIENCE_LABEL[v] }))}
        />
      </div>
      {groups.length > 0 ? (
        <fieldset className="space-y-3 rounded-lg border p-3">
          <legend className="px-1 text-sm font-medium">Reserve for a group (optional)</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {groups.map((g) => (
              <label key={g.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="groupIds" value={g.id} defaultChecked={defaults.groupIds?.includes(g.id)} className="size-4 accent-foreground" />
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
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="waitlistEnabled" defaultChecked={defaults.waitlistEnabled ?? true} className="mt-1 size-4 accent-foreground" />
        <span>
          <span className="font-medium">Keep a waitlist</span>
          <span className="block text-sm md:text-[13px] text-muted">When the shift is full, people can queue. If someone drops out, the next person in line gets the place and a notification.</span>
        </span>
      </label>
      <TextAreaField name="description" label="Details (optional)" defaultValue={defaults.description} maxLength={1000} rows={2} />
      <SubmitButton pendingText="Saving…">{submitLabel}</SubmitButton>
    </ActionForm>
  );
}
