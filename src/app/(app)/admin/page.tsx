import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { reviewQueue } from "@/lib/attendance";
import { requireUser, roleAtLeast } from "@/lib/auth/current-user";
import { listUpcomingEvents } from "@/lib/events";
import { pushOverview } from "@/lib/push-devices";
import { whoIsHere } from "@/lib/roster";
import { getSettings } from "@/lib/settings";
import { formatInTz } from "@/lib/time";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

function Tile({ href, label, value, note }: { href: string; label: string; value: string | number; note?: string }) {
  return (
    <Link href={href} className="group rounded-[8px] border p-4 transition-colors duration-150 hover:bg-surface">
      <p className="flex items-center justify-between text-[13px] text-muted">{label}<ArrowRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden /></p>
      <p className="mt-1 font-mono text-[28px] font-medium">{value}</p>
      {note ? <p className="text-[12px] text-muted">{note}</p> : null}
    </Link>
  );
}

export default async function AdminHome() {
  const user = await requireUser({ min: "lead" });
  const admin = roleAtLeast(user.role, "admin");
  const settings = await getSettings();
  const [here, review, upcoming, push] = await Promise.all([whoIsHere(), reviewQueue(), listUpcomingEvents(new Date(), 5), admin ? pushOverview() : null]);
  return (
    <div className="space-y-6">
      <AutoRefresh seconds={60} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile href="/admin/here" label="Clocked in now" value={here.length} />
        <Tile href="/admin/review" label="Attendance to review" value={review.length} />
        {push ? <Tile href="/admin/notifications" label="Notifications on" value={`${push.counts.active}/${push.rows.length}`} note="members with push working" /> : null}
        <Tile href="/admin/roster" label="Roster" value="Hours" note="by member and season" />
      </div>
      <Card>
        <CardHeader><CardTitle>Coming up</CardTitle></CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted">No upcoming events. <Link href="/calendar/new" className="text-accent underline-offset-4 hover:underline">Create one</Link>.</p>
          ) : (
            <ul className="divide-y">
              {upcoming.map((e) => (
                <li key={e.id}>
                  <Link href={`/calendar/${e.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:underline">
                    <span className={e.cancelledAt ? "text-muted line-through" : ""}>{e.title}</span>
                    <span className="flex items-center gap-2 font-mono text-[12px] text-muted">
                      {e.cancelledAt ? <Badge tone="error">Cancelled</Badge> : null}
                      {formatInTz(e.startsAt, settings.timezone, "EEE MMM d, h:mm a")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
