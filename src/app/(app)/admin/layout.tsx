import { AdminTabs, type AdminGroup } from "@/components/admin-tabs";
import { pendingReviewCount } from "@/lib/admin-pending";
import { requireUser, roleAtLeast } from "@/lib/auth/current-user";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser({ min: "lead" });
  const isAdmin = roleAtLeast(user.role, "admin");
  const pending = await pendingReviewCount(isAdmin);
  const groups: AdminGroup[] = [
    {
      label: "Today",
      tabs: [
        { href: "/admin", label: "Overview" },
        { href: "/admin/review", label: "Needs review", count: pending },
        { href: "/admin/here", label: "Who's here" },
      ],
    },
    {
      label: "People",
      tabs: [
        { href: "/admin/roster", label: "Roster" },
        ...(isAdmin ? [{ href: "/admin/people", label: "Accounts" }, { href: "/admin/groups", label: "Groups" }] : []),
      ],
    },
    ...(isAdmin
      ? [
          {
            label: "Team",
            tabs: [
              { href: "/admin/season", label: "Season" },
              { href: "/admin/notifications", label: "Notifications" },
              { href: "/admin/shop", label: "Shop" },
            ],
          },
          {
            label: "System",
            tabs: [
              { href: "/admin/settings", label: "Settings" },
              { href: "/admin/exports", label: "Exports" },
              { href: "/admin/audit", label: "Audit log" },
            ],
          },
        ]
      : []),
  ];
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Admin</h1>
      <AdminTabs groups={groups} />
      {children}
    </div>
  );
}
