import { CalendarCheck, CalendarDays, Clock, Home, KeyRound, Shield, ShoppingBag, Trophy, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; Icon: LucideIcon };

export function navItems(opts: { leaderboardEnabled: boolean; isStaff: boolean; isParent?: boolean; shopOpen?: boolean; hasLogins?: boolean }): NavItem[] {
  if (opts.isParent) {
    return [
      { href: "/parent", label: "Home", Icon: Home },
      { href: "/parent/calendar", label: "Calendar", Icon: CalendarDays },
      { href: "/parent/shifts", label: "Shifts", Icon: CalendarCheck },
    ];
  }
  const items: NavItem[] = [
    { href: "/", label: "Home", Icon: Home },
    { href: "/me/hours", label: "Attendance", Icon: Clock },
    { href: "/me/shifts", label: "Sign-ups", Icon: CalendarCheck },
    { href: "/calendar", label: "Calendar", Icon: CalendarDays },
  ];
  if (opts.shopOpen) items.push({ href: "/shop", label: "Shop", Icon: ShoppingBag });
  if (opts.hasLogins) items.push({ href: "/logins", label: "Logins", Icon: KeyRound });
  if (opts.leaderboardEnabled) items.push({ href: "/leaderboard", label: "Leaderboard", Icon: Trophy });
  return items;
}

/**
 * Phone bottom bar: at most 5 slots. Home, Attendance, Sign-ups and Calendar always get one; Shop and
 * Leaderboard share the last slot, and when both exist they go behind a "More" button.
 */
export function mobileNav(items: NavItem[]): { bar: NavItem[]; more: NavItem[] } {
  if (items.length <= 5) return { bar: items, more: [] };
  const core = (i: NavItem) => ["/", "/me/hours", "/me/shifts", "/calendar"].includes(i.href);
  const extras = items.filter((i) => !core(i));
  const bar = items.filter(core);
  return { bar, more: extras };
}

export const adminItem: NavItem = { href: "/admin", label: "Admin", Icon: Shield };

/** Whether the dock entry for `href` is the current page. Home and parent Home are exact-ish; the rest match by prefix. */
export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/parent") return pathname === "/parent" || /^\/parent\/(?!calendar)/.test(pathname);
  return pathname.startsWith(href);
}

/** Me and its settings pages (not Attendance or Sign-ups, which live in the dock). */
export function isMePath(pathname: string): boolean {
  if (pathname === "/me") return true;
  return pathname.startsWith("/me/") && !pathname.startsWith("/me/hours") && !pathname.startsWith("/me/shifts");
}
