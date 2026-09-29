"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function AdminTabs({ tabs }: { tabs: { href: string; label: string; count?: number }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin sections" className="-mx-4 mb-6 overflow-x-auto border-b px-4 md:mx-0 md:px-0">
      <ul className="flex gap-1">
        {tabs.map((t) => {
          const active = t.href === "/admin" ? pathname === "/admin" : pathname.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm transition-colors duration-150",
                  active ? "border-accent font-medium text-foreground" : "border-transparent text-muted hover:text-foreground",
                )}
              >
                {t.label}
                {t.count ? <span className="rounded-full bg-accent px-1.5 font-mono text-xs md:text-[11px] text-accent-fg">{t.count}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
