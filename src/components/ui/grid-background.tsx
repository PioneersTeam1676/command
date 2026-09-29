import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Wraps content in the subtle fading grid. Use on sign-in, setup, hero and empty areas.
 * Never wrap dense tables or forms. Pure CSS, static (see `.grid-bg` in globals.css).
 */
export function GridBackground({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("grid-bg", className)} {...props} />;
}
