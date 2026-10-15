"use client";
import { ChevronRight } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/form";
import { TextAreaField, TextField } from "@/components/form-fields";
import { requestEditAction, requestRemovalAction } from "@/app/(app)/me/hours/actions";

/**
 * Fix or remove one of your own entries. Your hours update straight away; a lead checks it and can undo it.
 * Inline and collapsed by default so the list stays calm.
 */
export function SessionChangeControls({ id, inAt, outAt, tz }: { id: string; inAt: string; outAt: string; tz: string }) {
  return (
    <details className="group rounded-lg border bg-surface/50">
      <summary className="flex min-h-11 cursor-pointer list-none items-center px-3 text-sm text-muted transition-colors duration-150 hover:text-foreground md:min-h-9 md:text-[13px] [&::-webkit-details-marker]:hidden">
        <ChevronRight className="mr-1.5 size-4 shrink-0 transition-transform duration-150 group-open:rotate-90" aria-hidden />
        Fix or remove
      </summary>
      <div className="space-y-6 border-t p-3">
        <p className="text-sm text-muted md:text-[13px]">Your hours change right away. A lead checks it and can put it back.</p>
        <ActionForm action={requestEditAction} className="space-y-3">
          <input type="hidden" name="id" value={id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField name="inAt" label="In" type="datetime-local" defaultValue={inAt} required help={`In ${tz}`} />
            <TextField name="outAt" label="Out" type="datetime-local" defaultValue={outAt} required />
          </div>
          <TextAreaField name="reason" label="What happened?" maxLength={300} rows={2} required />
          <SubmitButton size="sm" pendingText="Saving…">Save change</SubmitButton>
        </ActionForm>
        <ActionForm action={requestRemovalAction} className="space-y-3 border-t pt-4">
          <input type="hidden" name="id" value={id} />
          <TextAreaField name="reason" label="Remove this entry instead? Why?" maxLength={300} rows={2} required />
          <SubmitButton size="sm" variant="secondary" pendingText="Removing…">Remove entry</SubmitButton>
        </ActionForm>
      </div>
    </details>
  );
}
