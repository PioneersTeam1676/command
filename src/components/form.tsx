"use client";
import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import type { FormState } from "@/lib/form";

const initial: FormState = {};

export function SubmitButton({ children, pendingText, ...props }: ButtonProps & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-disabled={pending} {...props}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}

export function FormMessage({ state }: { state: FormState }) {
  if (state.error && !state.fieldErrors) {
    return (
      <p role="alert" className="flex items-start gap-2 rounded-lg border border-error/30 bg-error-subtle p-3 text-sm md:text-[13px] text-error">
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
        {state.error}
      </p>
    );
  }
  if (state.error && state.fieldErrors) {
    return (
      <p role="alert" className="text-sm md:text-[13px] text-error">
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return (
      <p role="status" className="flex items-start gap-2 rounded-lg border border-success/30 bg-success-subtle p-3 text-sm md:text-[13px] text-success">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
        {state.success}
      </p>
    );
  }
  return null;
}

export const FormStateContext = React.createContext<FormState>(initial);
/** Read the latest action state (for field errors) from inside an <ActionForm>. */
export const useFormState = () => React.useContext(FormStateContext);

export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, initial);
  const ref = React.useRef<HTMLFormElement>(null);
  React.useEffect(() => {
    if (resetOnSuccess && state.success) ref.current?.reset();
  }, [resetOnSuccess, state]);
  return (
    <FormStateContext.Provider value={state}>
      <form ref={ref} action={formAction} className={className}>
        {children}
        <FormMessage state={state} />
      </form>
    </FormStateContext.Provider>
  );
}
