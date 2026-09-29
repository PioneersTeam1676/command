import { CalendarDays, Home, Shield, Trophy, User, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; Icon: LucideIcon };

export function navItems(opts: { leaderboardEnabled: boolean; isStaff: boolean; isParent?: boolean }): NavItem[] {
  if (opts.isParent) {
    return [
      { href: "/parent", label: "Home", Icon: Home },
      { href: "/parent/calendar", label: "Calendar", Icon: CalendarDays },
    ];
  }
  const items: NavItem[] = [
    { href: "/", label: "Home", Icon: Home },
    { href: "/calendar", label: "Calendar", Icon: CalendarDays },
  ];
  if (opts.leaderboardEnabled && !opts.isParent) items.push({ href: "/leaderboard", label: "Leaderboard", Icon: Trophy });
  items.push({ href: "/me", label: "Me", Icon: User });
  return items;
}

export const adminItem: NavItem = { href: "/admin", label: "Admin", Icon: Shield };
