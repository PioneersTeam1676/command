"use client";
import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@/lib/utils";

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn("text-sm font-medium leading-none", className)} {...props} />
));
Label.displayName = "Label";

/** Label + control + helper/error text, so every input is labelled and described. */
export function Field({
  label,
  htmlFor,
  help,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  help?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {help && !error ? (
        <p id={`${htmlFor}-help`} className="text-sm md:text-[13px] text-muted">
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-sm md:text-[13px] text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
