import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", {
  variants: {
    tone: {
      neutral: "border-transparent bg-hover text-muted",
      success: "border-transparent bg-success-subtle text-success",
      warning: "border-transparent bg-warning-subtle text-warning",
      error: "border-transparent bg-error-subtle text-error",
      info: "border-transparent bg-info-subtle text-info",
      accent: "border-transparent bg-accent-subtle text-foreground",
    },
  },
  defaultVariants: { tone: "neutral" },
});

/** Status pill. Always carries a text label so meaning is never colour-only. */
export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
