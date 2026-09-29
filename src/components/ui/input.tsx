import * as React from "react";
import { cn } from "@/lib/utils";

const field =
  "w-full rounded-[8px] border bg-background px-3 text-sm text-foreground placeholder:text-muted transition-colors duration-150 ease-out focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 disabled:cursor-not-allowed disabled:opacity-50";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = "text", ...props }, ref) => (
    <input ref={ref} type={type} className={cn(field, "h-10 min-h-[44px] md:min-h-10", className)} {...props} />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn(field, "min-h-20 py-2", className)} {...props} />,
);
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select ref={ref} className={cn(field, "h-10 min-h-[44px] md:min-h-10", className)} {...props} />
  ),
);
Select.displayName = "Select";
