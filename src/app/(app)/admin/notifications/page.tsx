import type { Metadata } from "next";
import Link from "next/link";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { BellOff } from "lucide-react";
import { requireUser } from "@/lib/auth/current-user";
import { PUSH_STATUS_LABEL, type PushStatus } from "@/lib/push";
import { pushOverview } from "@/lib/push-devices";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

const tone = { active: "success", permission_denied: "error", never_enabled: "warning", expired: "warning" } as const;

export default async function AdminNotificationsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  await requireUser({ min: "admin" });
  const { filter } = await searchParams;
  const { rows, counts } = await pushOverview();
  const notOn = filter === "not-enabled";
  const shown = notOn ? rows.filter((r) => r.status !== "active") : rows;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">Who can actually receive reminders on their phone. Ask people who show as not enabled to open Me → Notifications.</p>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(Object.keys(counts) as PushStatus[]).map((k) => (
          <div key={k} className="rounded-lg border p-4">
            <dt className="text-sm md:text-[13px] text-muted">{PUSH_STATUS_LABEL[k]}</dt>
            <dd className="mt-1 font-mono text-[28px] font-medium">{counts[k]}</dd>
          </div>
        ))}
      </dl>
      <div className="flex gap-2" role="group" aria-label="Filter">
        <Button asChild size="sm" variant={notOn ? "secondary" : "primary"}><Link href="/admin/notifications">Everyone</Link></Button>
        <Button asChild size="sm" variant={notOn ? "primary" : "secondary"}><Link href="/admin/notifications?filter=not-enabled">Not enabled</Link></Button>
      </div>
      {shown.length === 0 ? (
        <EmptyState icon={<BellOff />} title={notOn ? "Everyone has notifications on" : "No members yet"}>{notOn ? "Nice. Nobody is missing reminders." : "People appear here once they've joined."}</EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-[1fr_180px_90px_170px] gap-4 border-b bg-surface px-4 py-2 text-[13px] md:text-[12px] font-medium text-muted md:grid">
            <span>Member</span><span>Status</span><span>Devices</span><span>Last push delivered</span>
          </div>
          <ul className="divide-y">
            {shown.map((r) => (
              <li key={r.userId} className={cn("grid gap-1 px-4 py-3 md:grid-cols-[1fr_180px_90px_170px] md:items-center md:gap-4")}>
                <span className="font-medium">{r.name} <span className="text-[13px] md:text-[12px] font-normal capitalize text-muted">{r.role}</span></span>
                <span><Badge tone={tone[r.status]}>{PUSH_STATUS_LABEL[r.status]}</Badge></span>
                <span className="font-mono text-sm md:text-[13px] text-muted"><span className="md:hidden">Devices: </span>{r.devices}</span>
                <span className="font-mono text-sm md:text-[13px] text-muted">{r.lastSuccessAt ? format(r.lastSuccessAt, "MMM d, h:mm a") : "Never"}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
