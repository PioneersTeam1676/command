"use client";
import { CheckCircle2 } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/form";
import { TextField } from "@/components/form-fields";
import { Card, CardContent } from "@/components/ui/card";
import type { FormState } from "@/lib/form";

/** "Are you coming?" for an event: one big button, an optional note for the leads, and a clear way to back out. */
export function AttendCard({
  eventId,
  going,
  note,
  count,
  action,
}: {
  eventId: string;
  going: boolean;
  note: string | null;
  count: number;
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
}) {
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold tracking-tight">{going ? "You're going" : "Are you coming?"}</h2>
          <p className="text-sm text-muted">{count === 0 ? "Nobody yet" : `${count} going`}</p>
        </div>
        <ActionForm action={action} className="space-y-3">
          <input type="hidden" name="eventId" value={eventId} />
          <TextField name="note" label={going ? "Your note" : "Add a note (optional)"} defaultValue={note ?? ""} maxLength={300} help="Only leads and admins see this. For example: “I'll be 20 minutes late.”" />
          {going ? (
            <div className="flex flex-wrap gap-2">
              <SubmitButton name="going" value="true" variant="secondary" pendingText="Saving…">Save note</SubmitButton>
              <SubmitButton name="going" value="false" variant="ghost" pendingText="Working…">I can&apos;t make it</SubmitButton>
            </div>
          ) : (
            <SubmitButton name="going" value="true" size="lg" className="w-full sm:w-auto" pendingText="Signing you up…">
              <CheckCircle2 aria-hidden /> I&apos;m going
            </SubmitButton>
          )}
        </ActionForm>
      </CardContent>
    </Card>
  );
}
