"use client";
import { useActionState } from "react";
import { CopyField } from "@/components/copy-field";
import { FormMessage, SubmitButton } from "@/components/form";
import type { FormState } from "@/lib/form";

export function ResetPasswordButton({ userId, action }: { userId: string; action: (prev: FormState, fd: FormData) => Promise<FormState> }) {
  const [state, formAction] = useActionState(action, {} as FormState);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={userId} />
      <SubmitButton size="sm" variant="secondary" pendingText="Resetting…">Reset password</SubmitButton>
      {state.data?.password ? <CopyField value={state.data.password} label="Temporary password" /> : null}
      <FormMessage state={state} />
    </form>
  );
}
