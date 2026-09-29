import * as React from "react";
import { cn } from "@/lib/utils";

const field =
  "w-full rounded-[10px] border bg-background px-3.5 text-base md:rounded-[8px] md:px-3 md:text-sm text-foreground placeholder:text-muted transition-colors duration-150 ease-out focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 disabled:cursor-not-allowed disabled:opacity-50";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = "text", ...props }, ref) => (
    <input ref={ref} type={type} className={cn(field, "h-12 md:h-10", className)} {...props} />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn(field, "min-h-24 py-3 md:min-h-20 md:py-2", className)} {...props} />,
);
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select ref={ref} className={cn(field, "h-12 md:h-10", className)} {...props} />
  ),
);
Select.displayName = "Select";
