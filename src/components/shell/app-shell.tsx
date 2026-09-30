"use client";
import { useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { logoutAction } from "@/app/(auth)/actions";
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

const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : href === "/parent" ? pathname === "/parent" || /^\/parent\/(?!calendar)/.test(pathname) : pathname.startsWith(href));

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
        <img src={logoUrl} alt="" className="size-7 shrink-0 rounded-[6px] object-cover" />
      ) : (
        <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-[6px] bg-accent text-[13px] text-accent-fg">
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
      title={item.label}
      className={cn(
        "flex min-h-10 items-center gap-3 whitespace-nowrap rounded-[6px] px-4 text-sm transition-colors duration-150",
        active ? "bg-accent-subtle font-medium text-foreground" : "text-muted hover:bg-surface hover:text-foreground",
      )}
    >
      <item.Icon className="size-4 shrink-0" aria-hidden />
      {item.label}
    </Link>
  );
}

/** Phone: bottom tab bar. Desktop: 240px sidebar with the same items plus Admin. */
export function AppShell({ teamName, logoUrl, leaderboardEnabled, isStaff, isParent, banner, children }: Props) {
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
    }
  };
  const items = navItems({ leaderboardEnabled, isStaff, isParent });
  const all = isStaff ? [...items.slice(0, -1), adminItem, ...items.slice(-1)] : items;

  return (
    <div
      ref={shell}
      className="min-h-dvh md:grid md:transition-[grid-template-columns] md:duration-200 md:ease-[cubic-bezier(0.32,0.72,0,1)] md:data-[dragging]:transition-none"
      style={{ gridTemplateColumns: `${stored ? RAIL : FULL}px 1fr` }}
    >
      <a href="#main" className="sr-only z-50 rounded-[6px] bg-background px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:border">
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-dvh min-w-0 flex-col gap-6 overflow-hidden border-r bg-surface/50 px-2 py-4 md:flex">
        <div className="flex items-center justify-between gap-2 pl-2.5">
          <Brand teamName={teamName} logoUrl={logoUrl} href={isParent ? "/parent" : "/"} />
          <button
            type="button"
            onClick={toggle}
            aria-label={stored ? "Expand sidebar" : "Collapse sidebar"}
            title={stored ? "Expand sidebar" : "Collapse sidebar"}
            className="grid size-7 shrink-0 place-items-center rounded-[6px] text-muted transition-colors duration-150 hover:bg-surface hover:text-foreground"
          >
            {stored ? <PanelLeftOpen className="size-4" aria-hidden /> : <PanelLeftClose className="size-4" aria-hidden />}
          </button>
        </div>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {all.map((item) => (
            <SidebarLink key={item.href} item={item} active={isActive(pathname, item.href)} />
          ))}
        </nav>
        {isParent ? (
          <form action={logoutAction} className="mt-auto">
            <button type="submit" title="Sign out" className="flex min-h-10 w-full items-center gap-3 whitespace-nowrap rounded-[6px] px-4 text-sm text-muted transition-colors duration-150 hover:bg-surface hover:text-foreground">
              <LogOut className="size-4 shrink-0" aria-hidden />
              Sign out
            </button>
          </form>
        ) : null}
        <div
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label="Resize sidebar"
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
        <header className="pt-safe sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center justify-between border-b bg-background px-5 md:hidden">
          <Brand teamName={teamName} logoUrl={logoUrl} href={isParent ? "/parent" : "/"} />
          {isStaff ? (
            <Link href="/admin" className="inline-flex min-h-[44px] items-center px-2 text-sm font-medium text-accent">
              Admin
            </Link>
          ) : null}
          {isParent ? (
            <form action={logoutAction}>
              <button type="submit" className="inline-flex min-h-[44px] items-center px-2 text-sm font-medium text-accent">
                Sign out
              </button>
            </form>
          ) : null}
        </header>
        <div className="hidden h-12 items-center justify-end border-b px-6 md:flex">
          <span className="text-[13px] text-muted">{teamName}</span>
        </div>
        {banner}
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-4xl flex-1 px-5 pb-32 pt-6 md:px-8 md:pb-12 md:pt-8">{children}</main>
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
                "flex min-h-[64px] flex-col items-center justify-center gap-1 text-xs transition-colors duration-150",
                active ? "font-medium text-accent" : "text-muted",
              )}
            >
              <item.Icon className="size-6" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
