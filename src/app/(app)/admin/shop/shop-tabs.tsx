import Link from "next/link";
import { cn } from "@/lib/utils";

/** Items / Orders switch inside the Shop admin page. */
export function ShopTabs({ active, pending }: { active: "items" | "orders"; pending: number }) {
  const tab = (href: string, label: string, on: boolean, count = 0) => (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={cn("inline-flex min-h-10 items-center gap-2 rounded-[8px] px-4 text-sm", on ? "bg-accent-subtle font-medium" : "text-muted hover:bg-surface hover:text-foreground")}
    >
      {label}
      {count ? <span className="rounded-full bg-accent px-1.5 font-mono text-xs text-accent-fg">{count}</span> : null}
    </Link>
  );
  return (
    <div className="flex gap-1">
      {tab("/admin/shop", "Items", active === "items")}
      {tab("/admin/shop/orders", "Orders", active === "orders", pending)}
    </div>
  );
}
