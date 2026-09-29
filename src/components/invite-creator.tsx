"use client";
import { useActionState } from "react";
import { SubmitButton, FormMessage } from "@/components/form";
import { CopyField } from "@/components/copy-field";
import type { FormState } from "@/lib/form";

export function InviteCreator({ action }: { action: () => Promise<FormState> }) {
  const [state, formAction] = useActionState(async () => action(), {} as FormState);
  return (
    <form action={formAction} className="space-y-3">
      <SubmitButton variant="secondary" pendingText="Creating…">Create parent invite link</SubmitButton>
      {state.data?.url ? <CopyField value={state.data.url} label="Parent invite link" /> : null}
      <FormMessage state={state} />
    </form>
  );
}
