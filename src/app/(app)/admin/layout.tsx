import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { accessRequests, parentLinks } from "@/db/schema";
import { AdminTabs } from "@/components/admin-tabs";
import { requireUser, roleAtLeast } from "@/lib/auth/current-user";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser({ min: "lead" });
  const isAdmin = roleAtLeast(user.role, "admin");
  let pending = 0;
  if (isAdmin) {
    const [a] = await db.select({ n: sql<number>`count(*)::int` }).from(accessRequests).where(eq(accessRequests.status, "pending"));
    const [p] = await db.select({ n: sql<number>`count(*)::int` }).from(parentLinks).where(and(eq(parentLinks.status, "pending")));
    pending = (a?.n ?? 0) + (p?.n ?? 0);
  }
  const tabs = [
    { href: "/admin", label: "Overview" },
    { href: "/admin/review", label: "Needs review", count: pending },
    ...(isAdmin ? [{ href: "/admin/people", label: "People" }, { href: "/admin/season", label: "Season" }] : []),
  ];
  return (
    <div>
      <h1 className="mb-4 text-[28px] font-semibold">Admin</h1>
      <AdminTabs tabs={tabs} />
      {children}
    </div>
  );
}
