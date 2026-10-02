import Link from "next/link";
import { cn } from "@/lib/utils";

/** Items / Orders switch inside the Shop admin page. */
export function ShopTabs({ active, pending }: { active: "items" | "orders"; pending: number }) {
  const tab = (href: string, label: string, on: boolean, count = 0) => (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={cn("inline-flex min-h-9 items-center gap-2 rounded-md px-3 text-[13px]", on ? "bg-hover font-medium" : "text-muted hover:bg-hover hover:text-foreground")}
    >
      {label}
      {count ? <span className="rounded-full bg-foreground px-1.5 font-mono text-[11px] text-background">{count}</span> : null}
    </Link>
  );
  return (
    <div className="flex gap-1">
      {tab("/admin/shop", "Items", active === "items")}
      {tab("/admin/shop/orders", "Orders", active === "orders", pending)}
    </div>
  );
}
