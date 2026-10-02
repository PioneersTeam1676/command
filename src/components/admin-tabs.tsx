"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type AdminTab = { href: string; label: string; count?: number };
export type AdminGroup = { label: string; tabs: AdminTab[] };

const isActive = (pathname: string, href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));
const sum = (tabs: AdminTab[]) => tabs.reduce((n, t) => n + (t.count ?? 0), 0);

function Count({ n }: { n: number }) {
  return n ? <span className="rounded-full bg-foreground px-1.5 font-mono text-[11px] text-background">{n}</span> : null;
}

/** Two levels, no scrolling: a few group tabs, then only the links of the open group. */
export function AdminTabs({ groups }: { groups: AdminGroup[] }) {
  const pathname = usePathname();
  const open = groups.find((g) => g.tabs.some((t) => isActive(pathname, t.href))) ?? groups[0];
  if (!open) return null;
  return (
    <nav aria-label="Admin sections" className="mb-6">
      <ul className="flex flex-wrap border-b">
        {groups.map((g) => {
          const current = g === open;
          return (
            <li key={g.label}>
              <Link
                href={g.tabs[0]!.href}
                aria-current={current ? "true" : undefined}
                className={cn(
                  "-mb-px inline-flex min-h-[44px] items-center gap-2 border-b-2 px-3 text-sm transition-colors duration-150 md:min-h-10",
                  current ? "border-foreground font-medium text-foreground" : "border-transparent text-muted hover:text-foreground",
                )}
              >
                {g.label}
                {current ? null : <Count n={sum(g.tabs)} />}
              </Link>
            </li>
          );
        })}
      </ul>
      {open.tabs.length > 1 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {open.tabs.map((t) => {
            const active = isActive(pathname, t.href);
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-2 rounded-md px-3 text-[13px] transition-colors duration-150",
                    active ? "bg-hover font-medium text-foreground" : "text-muted hover:bg-hover hover:text-foreground",
                  )}
                >
                  {t.label}
                  <Count n={t.count ?? 0} />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </nav>
  );
}
