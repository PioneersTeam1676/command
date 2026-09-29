"use client";
import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { SubmitButton } from "@/components/form";

/** Button that asks first, in plain words, then runs a server action with the given hidden fields. */
export function ConfirmAction({
  label,
  title,
  description,
  confirmLabel,
  action,
  fields,
  variant = "secondary",
  size = "sm",
  danger = false,
  children,
}: {
  label: string;
  title: string;
  description: string;
  confirmLabel: string;
  action: (formData: FormData) => void | Promise<void>;
  fields: Record<string, string>;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  danger?: boolean;
  /** Optional extra inputs inside the dialog (e.g. a reason). */
  children?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size}>{label}</Button>
      </DialogTrigger>
      <DialogContent title={title} description={description}>
        <form
          action={async (fd) => {
            await action(fd);
            setOpen(false);
          }}
          className="space-y-4"
        >
          {Object.entries(fields).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          {children}
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">Cancel</Button>
            </DialogClose>
            <SubmitButton variant={danger ? "danger" : "primary"} pendingText="Working…">{confirmLabel}</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
