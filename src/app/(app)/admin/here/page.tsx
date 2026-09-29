import type { Metadata } from "next";
import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { Users } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { ConfirmAction } from "@/components/confirm-action";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth/current-user";
import { whoIsHere } from "@/lib/roster";
import { getSettings } from "@/lib/settings";
import { formatInTz } from "@/lib/time";
import { forceClockOutAction } from "../roster/actions";

export const metadata: Metadata = { title: "Who's here" };
export const dynamic = "force-dynamic";

export default async function HerePage() {
  await requireUser({ min: "lead" });
  const [here, settings] = await Promise.all([whoIsHere(), getSettings()]);
  return (
    <div className="space-y-4">
      <AutoRefresh seconds={30} />
      <p className="text-sm text-muted">Everyone who is clocked in right now. This updates by itself.</p>
      {here.length === 0 ? (
        <EmptyState icon={<Users />} title="Nobody is clocked in">When someone clocks in, they appear here.</EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y">
            {here.map((h) => (
              <li key={h.sessionId} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <Link href={`/admin/roster/${h.userId}`} className="font-medium underline-offset-4 hover:underline">{h.name}</Link>
                  <p className="text-sm md:text-[13px] text-muted">
                    {h.kind === "event" ? h.eventTitle ?? "Event" : "Build season clock-in"} · in at{" "}
                    <span className="font-mono">{formatInTz(h.since, settings.timezone, "h:mm a")}</span> ({formatDistanceToNowStrict(h.since)})
                  </p>
                  {h.origin === "offline_synced" ? <Badge className="mt-1">Saved offline</Badge> : null}
                </div>
                <ConfirmAction
                  label="Clock out"
                  title={`Clock ${h.name} out now?`}
                  description="This ends their open session at this moment. It will be marked as edited by you in the audit log."
                  confirmLabel="Clock out"
                  action={forceClockOutAction}
                  fields={{ id: h.sessionId, userId: h.userId }}
                  danger
                />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
