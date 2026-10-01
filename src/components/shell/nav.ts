import { CalendarCheck, CalendarDays, Home, Shield, ShoppingBag, Trophy, User, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; Icon: LucideIcon };

export function navItems(opts: { leaderboardEnabled: boolean; isStaff: boolean; isParent?: boolean; shopOpen?: boolean }): NavItem[] {
  if (opts.isParent) {
    return [
      { href: "/parent", label: "Home", Icon: Home },
      { href: "/parent/calendar", label: "Calendar", Icon: CalendarDays },
      { href: "/parent/shifts", label: "Shifts", Icon: CalendarCheck },
    ];
  }
  const items: NavItem[] = [
    { href: "/", label: "Home", Icon: Home },
    { href: "/calendar", label: "Calendar", Icon: CalendarDays },
    { href: "/me/shifts", label: "My shifts", Icon: CalendarCheck },
  ];
  if (opts.shopOpen) items.push({ href: "/shop", label: "Shop", Icon: ShoppingBag });
  if (opts.leaderboardEnabled) items.push({ href: "/leaderboard", label: "Leaderboard", Icon: Trophy });
  items.push({ href: "/me", label: "Me", Icon: User });
  return items;
}

/**
 * Phone bottom bar: at most 5 slots. Home, Calendar, My shifts and Me always get one; Shop and Leaderboard
 * share the last slot, and when both exist they go behind a "More" button.
 */
export function mobileNav(items: NavItem[]): { bar: NavItem[]; more: NavItem[] } {
  if (items.length <= 5) return { bar: items, more: [] };
  const core = (i: NavItem) => ["/", "/calendar", "/me/shifts", "/me"].includes(i.href);
  const extras = items.filter((i) => !core(i));
  const bar = items.filter(core);
  return { bar, more: extras };
}

export const adminItem: NavItem = { href: "/admin", label: "Admin", Icon: Shield };
