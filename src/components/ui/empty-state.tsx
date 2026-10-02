import * as React from "react";
import { cn } from "@/lib/utils";

/** Empty state: says what this place is for and what to do next. */
export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center", className)}>
      {icon ? <div className="text-muted [&_svg]:size-6">{icon}</div> : null}
      <p className="text-[15px] font-medium">{title}</p>
      {children ? <p className="max-w-sm text-sm md:text-[13px] text-muted">{children}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
