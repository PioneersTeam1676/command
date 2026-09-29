"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { adminItem, navItems, type NavItem } from "./nav";

type Props = {
  teamName: string;
  logoUrl?: string | null;
  leaderboardEnabled: boolean;
  isStaff: boolean;
  isParent?: boolean;
  banner?: React.ReactNode;
  children: React.ReactNode;
};

const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

function Brand({ teamName, logoUrl }: { teamName: string; logoUrl?: string | null }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="size-7 rounded-[6px] object-cover" />
      ) : (
        <span aria-hidden className="grid size-7 place-items-center rounded-[6px] bg-accent text-[13px] text-accent-fg">
          {teamName.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="truncate">{teamName}</span>
    </Link>
  );
}

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-10 items-center gap-2.5 rounded-[6px] px-3 text-sm transition-colors duration-150",
        active ? "bg-accent-subtle font-medium text-foreground" : "text-muted hover:bg-surface hover:text-foreground",
      )}
    >
      <item.Icon className="size-4" aria-hidden />
      {item.label}
    </Link>
  );
}

/** Phone: bottom tab bar. Desktop: 240px sidebar with the same items plus Admin. */
export function AppShell({ teamName, logoUrl, leaderboardEnabled, isStaff, isParent, banner, children }: Props) {
  const pathname = usePathname();
  const items = navItems({ leaderboardEnabled, isStaff, isParent });
  const all = isStaff ? [...items.slice(0, -1), adminItem, ...items.slice(-1)] : items;

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[240px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r bg-surface/50 p-4 md:flex">
        <Brand teamName={teamName} logoUrl={logoUrl} />
        <nav aria-label="Main" className="flex flex-col gap-1">
          {all.map((item) => (
            <SidebarLink key={item.href} item={item} active={isActive(pathname, item.href)} />
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="pt-safe sticky top-0 z-30 flex h-12 items-center justify-between border-b bg-background/90 px-4 backdrop-blur md:hidden">
          <Brand teamName={teamName} logoUrl={logoUrl} />
          {isStaff ? (
            <Link href="/admin" className="inline-flex min-h-[44px] items-center px-2 text-[13px] font-medium text-accent">
              Admin
            </Link>
          ) : null}
        </header>
        <div className="hidden h-12 items-center justify-end border-b px-6 md:flex">
          <span className="text-[13px] text-muted">{teamName}</span>
        </div>
        {banner}
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-28 pt-6 md:px-8 md:pb-12 md:pt-8">{children}</main>
      </div>

      <nav
        aria-label="Main"
        className="pb-safe fixed inset-x-0 bottom-0 z-40 grid border-t bg-background/95 backdrop-blur md:hidden"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] transition-colors duration-150",
                active ? "font-medium text-accent" : "text-muted",
              )}
            >
              <item.Icon className="size-5" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
