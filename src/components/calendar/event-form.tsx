"use client";
import { ActionForm, SubmitButton } from "@/components/form";
import { SelectField, TextAreaField, TextField } from "@/components/form-fields";
import type { FormState } from "@/lib/form";

export type EventFormDefaults = {
  id?: string;
  title?: string;
  description?: string;
  locationText?: string;
  startsAt: string;
  endsAt: string;
  verification?: string;
  rsvpEnabled?: boolean;
};

export function EventForm({
  action,
  defaults,
  tz,
  verificationOnly = false,
  teamDefault,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  defaults: EventFormDefaults;
  tz: string;
  /** Imported events: everything but the check-in method is read-only. */
  verificationOnly?: boolean;
  teamDefault: "none" | "code";
}) {
  const ro = verificationOnly;
  return (
    <ActionForm action={action} className="space-y-4">
      {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}
      {ro ? (
        <>
          {/* Read-only fields still submit so validation passes; the server ignores them for imported events. */}
          <input type="hidden" name="title" value={defaults.title ?? ""} />
          <input type="hidden" name="startsAt" value={defaults.startsAt} />
          <input type="hidden" name="endsAt" value={defaults.endsAt} />
          <p className="rounded-[8px] border bg-surface p-3 text-sm md:text-[13px] text-muted">
            This event was imported from Google Calendar, so its title and times are edited there. You can still choose how members check in.
          </p>
        </>
      ) : (
        <>
          <TextField name="title" label="Title" defaultValue={defaults.title} required maxLength={120} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField name="startsAt" label="Starts" type="datetime-local" defaultValue={defaults.startsAt} required help={`In ${tz}`} />
            <TextField name="endsAt" label="Ends" type="datetime-local" defaultValue={defaults.endsAt} required />
          </div>
          <TextField name="locationText" label="Location (optional)" defaultValue={defaults.locationText} maxLength={200} />
          <TextAreaField name="description" label="Details (optional)" defaultValue={defaults.description} maxLength={2000} rows={4} />
        </>
      )}
      <SelectField
        name="verification"
        label="How do members check in?"
        defaultValue={defaults.verification ?? "inherit"}
        options={[
          { value: "inherit", label: `Use the team setting (currently: ${teamDefault === "code" ? "rotating code" : "one tap"})` },
          { value: "none", label: "One tap, no code" },
          { value: "code", label: "Rotating code shown on a screen" },
        ]}
        help="A rotating code proves someone is physically at the event."
      />
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="rsvpEnabled" defaultChecked={defaults.rsvpEnabled ?? true} className="mt-1 size-4 accent-[var(--accent)]" />
        <span>
          <span className="font-medium">Let people sign up to come</span>
          <span className="block text-sm md:text-[13px] text-muted">Adds an “I&apos;m going” button so you can see who&apos;s coming, and only they get reminders. Turn off for mandatory events: everyone is then reminded.</span>
        </span>
      </label>
      <SubmitButton size="lg" pendingText="Saving…">{defaults.id ? "Save changes" : "Create event"}</SubmitButton>
    </ActionForm>
  );
}
