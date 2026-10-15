"use client";
import { useRef, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ellipsis, LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { logoutAction } from "@/app/(auth)/actions";
import { cn } from "@/lib/utils";
import { adminItem, isMePath, isNavActive, mobileNav, navItems, type NavItem } from "./nav";
import { UserAvatar } from "./user-avatar";

type Props = {
  teamName: string;
  logoUrl?: string | null;
  leaderboardEnabled: boolean;
  isStaff: boolean;
  isParent?: boolean;
  shopOpen?: boolean;
  me?: { name: string; avatarUrl: string | null };
  /** Things waiting on a lead or admin; shown on the Admin entry. */
  adminCount?: number;
  banner?: React.ReactNode;
  children: React.ReactNode;
};

const KEY = "sidebar-collapsed";
const FULL = 240;
const RAIL = 64;
const SNAP = 152;
const MAX = 320;
const subscribeCollapsed = (cb: () => void) => {
  window.addEventListener(KEY, cb);
  return () => window.removeEventListener(KEY, cb);
};
const readCollapsed = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

function Brand({ teamName, logoUrl, href = "/" }: { teamName: string; logoUrl?: string | null; href?: string }) {
  return (
    <Link href={href} aria-label={teamName} className="flex min-w-0 items-center gap-2.5 whitespace-nowrap font-semibold tracking-tight">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="size-7 shrink-0 rounded-md object-cover" />
      ) : (
        <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-md bg-accent text-[13px] text-accent-fg">
          {teamName.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="truncate">{teamName}</span>
    </Link>
  );
}

function SidebarLink({ item, active, rail, count = 0 }: { item: NavItem; active: boolean; rail: boolean; count?: number }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={item.label}
      className={cn(
        "relative flex min-h-9 items-center gap-2.5 whitespace-nowrap rounded-md text-[13px] transition-colors duration-150",
        rail ? "justify-center px-0" : "px-2.5",
        active ? "bg-hover font-medium text-foreground" : "text-muted hover:bg-hover hover:text-foreground",
      )}
    >
      <item.Icon className="size-4 shrink-0" aria-hidden />
      <span className={rail ? "sr-only" : undefined}>{item.label}</span>
      {count && !rail ? <CountPill n={count} className="ml-auto" /> : null}
      {count && rail ? (
        <>
          <span aria-hidden className="absolute right-1.5 top-1.5 size-2 rounded-full bg-foreground" />
          <span className="sr-only">, {count} waiting for review</span>
        </>
      ) : null}
    </Link>
  );
}

function CountPill({ n, className }: { n: number; className?: string }) {
  if (!n) return null;
  return (
    <span className={cn("rounded-full bg-foreground px-1.5 font-mono text-[11px] leading-[18px] text-background", className)}>
      {n > 99 ? "99+" : n}
      <span className="sr-only"> waiting for review</span>
    </span>
  );
}

function MeLink({ me, active, className }: { me: { name: string; avatarUrl: string | null }; active: boolean; className?: string }) {
  return (
    <Link
      href="/me"
      aria-label="Me"
      aria-current={active ? "page" : undefined}
      title={me.name}
      className={cn("inline-grid size-11 place-items-center rounded-full transition-colors duration-150 md:size-9", active ? "bg-hover" : "hover:bg-hover", className)}
    >
      <UserAvatar name={me.name} avatarUrl={me.avatarUrl} />
    </Link>
  );
}

/** Phone: bottom tab bar. Desktop: 240px sidebar with the same items plus Admin. */
export function AppShell({ teamName, logoUrl, leaderboardEnabled, isStaff, isParent, shopOpen, me, adminCount = 0, banner, children }: Props) {
  const pathname = usePathname();
  const stored = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  const shell = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; w: number; moved: boolean } | null>(null);
  const setCols = (w: number) => {
    shell.current?.style.setProperty("grid-template-columns", `${w}px 1fr`);
  };
  const save = (c: boolean) => {
    try {
      localStorage.setItem(KEY, c ? "1" : "0");
    } catch {}
    window.dispatchEvent(new Event(KEY));
  };
  const toggle = () => save(!stored);
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, w: stored ? RAIL : FULL, moved: false };
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || !shell.current) return;
    if (!d.moved && Math.abs(e.clientX - d.x) < 4) return;
    if (!d.moved) shell.current.dataset.dragging = "";
    d.moved = true;
    setCols(Math.min(MAX, Math.max(RAIL, d.w + e.clientX - d.x)));
  };
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || !shell.current) return;
    if (!d.moved) return toggle();
    const w = Math.min(MAX, Math.max(RAIL, d.w + e.clientX - d.x));
    delete shell.current.dataset.dragging;
    const c = w < SNAP;
    setCols(c ? RAIL : FULL);
    save(c);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      save(e.key === "ArrowLeft");
    }
  };
  const items = navItems({ leaderboardEnabled, isStaff, isParent, shopOpen });
  const all = isStaff ? [...items, adminItem] : items;
  const { bar, more } = mobileNav(items);
  const slots = bar.length + (more.length ? 1 : 0);

  return (
    <div
      ref={shell}
      className="min-h-dvh md:grid md:transition-[grid-template-columns] md:duration-200 md:ease-[cubic-bezier(0.32,0.72,0,1)] md:data-[dragging]:transition-none"
      style={{ gridTemplateColumns: `${stored ? RAIL : FULL}px 1fr` }}
    >
      <a href="#main" className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:border">
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-dvh min-w-0 flex-col gap-5 overflow-hidden border-r bg-surface px-2 py-3 md:flex">
        <div className={cn("flex items-center gap-2", stored ? "flex-col" : "justify-between pl-2.5")}>
          {stored ? null : <Brand teamName={teamName} logoUrl={logoUrl} href={isParent ? "/parent" : "/"} />}
          <div className={cn("flex items-center gap-1", stored && "flex-col")}>
            {me ? <MeLink me={me} active={isMePath(pathname)} /> : null}
            <button
              type="button"
              onClick={toggle}
              aria-label={stored ? "Expand sidebar" : "Collapse sidebar"}
              title={stored ? "Expand sidebar" : "Collapse sidebar"}
              className="grid size-7 shrink-0 place-items-center rounded-md text-muted transition-colors duration-150 hover:bg-hover hover:text-foreground"
            >
              {stored ? <PanelLeftOpen className="size-4" aria-hidden /> : <PanelLeftClose className="size-4" aria-hidden />}
            </button>
          </div>
        </div>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {all.map((item) => (
            <SidebarLink key={item.href} item={item} active={isNavActive(pathname, item.href)} rail={stored} count={item.href === "/admin" ? adminCount : 0} />
          ))}
        </nav>
        {isParent ? (
          <form action={logoutAction} className="mt-auto">
            <button type="submit" title="Sign out" className={cn("flex min-h-9 w-full items-center gap-2.5 whitespace-nowrap rounded-md text-[13px] text-muted transition-colors duration-150 hover:bg-hover hover:text-foreground", stored ? "justify-center px-0" : "px-2.5")}>
              <LogOut className="size-4 shrink-0" aria-hidden />
              <span className={stored ? "sr-only" : undefined}>Sign out</span>
            </button>
          </form>
        ) : null}
        <div
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          aria-valuemin={RAIL}
          aria-valuemax={FULL}
          aria-valuenow={stored ? RAIL : FULL}
          aria-valuetext={stored ? "Collapsed" : "Expanded"}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onKeyDown={onKey}
          className="group absolute inset-y-0 right-0 z-20 w-2 cursor-col-resize touch-none"
        >
          <span className="absolute inset-y-0 right-0 w-0.5 bg-accent opacity-0 transition-opacity group-hover:opacity-50 group-focus-visible:opacity-70" />
        </div>
      </aside>


      <div className="flex min-w-0 flex-col">
        <header className="pt-safe sticky top-0 z-30 flex h-[calc(3rem+env(safe-area-inset-top))] items-center justify-between border-b bg-background px-4 md:hidden">
          <Brand teamName={teamName} logoUrl={logoUrl} href={isParent ? "/parent" : "/"} />
          <div className="flex items-center gap-1">
            {isStaff ? (
              <Link href="/admin" className="inline-flex min-h-[44px] items-center gap-1.5 px-2 text-[13px] font-medium text-muted hover:text-foreground">
                Admin
                <CountPill n={adminCount} />
              </Link>
            ) : null}
            {me ? <MeLink me={me} active={isMePath(pathname)} /> : null}
            {isParent ? (
              <form action={logoutAction}>
                <button type="submit" className="inline-flex min-h-[44px] items-center px-2 text-[13px] font-medium text-muted hover:text-foreground">
                  Sign out
                </button>
              </form>
            ) : null}
          </div>
        </header>
        {banner}
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-4xl flex-1 px-4 pb-28 pt-5 md:px-8 md:pb-16 md:pt-10">{children}</main>
      </div>

      <nav
        aria-label="Main"
        className="pb-safe fixed inset-x-0 bottom-0 z-40 grid border-t bg-background md:hidden"
        style={{ gridTemplateColumns: `repeat(${slots}, minmax(0, 1fr))` }}
      >
        {bar.map((item) => {
          const active = isNavActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] transition-colors duration-150",
                active ? "font-medium text-foreground" : "text-muted",
              )}
            >
              <item.Icon className="size-5" aria-hidden />
              {item.label}
            </Link>
          );
        })}
        {more.length ? (
          <Dialog>
            <DialogTrigger asChild>
              <button
                type="button"
                className={cn("flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] transition-colors duration-150", more.some((m) => isNavActive(pathname, m.href)) ? "font-medium text-foreground" : "text-muted")}
              >
                <Ellipsis className="size-5" aria-hidden />
                More
              </button>
            </DialogTrigger>
            <DialogContent title="More">
              <ul className="-mx-2 space-y-1">
                {more.map((item) => (
                  <li key={item.href}>
                    <DialogClose asChild>
                      <Link href={item.href} className="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm hover:bg-hover">
                        <item.Icon className="size-5 text-muted" aria-hidden />
                        {item.label}
                      </Link>
                    </DialogClose>
                  </li>
                ))}
              </ul>
            </DialogContent>
          </Dialog>
        ) : null}
      </nav>
    </div>
  );
}
