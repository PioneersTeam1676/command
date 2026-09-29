import type { Metadata } from "next";
import Link from "next/link";
import { format } from "date-fns";
import { ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireUser } from "@/lib/auth/current-user";
import { auditActors, queryAudit } from "@/lib/audit-query";

export const metadata: Metadata = { title: "Audit log" };
export const dynamic = "force-dynamic";

type SP = { action?: string; actor?: string; from?: string; to?: string; page?: string };

const GROUPS: [string, string][] = [
  ["", "Everything"],
  ["user.", "People and roles"],
  ["access_request.", "Join requests"],
  ["parent_link.", "Parent links"],
  ["attendance.", "Attendance edits"],
  ["event.", "Events"],
  ["settings.", "Settings"],
  ["season.", "Seasons"],
  ["export.", "Downloads"],
];

export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser({ min: "admin" });
  const sp = await searchParams;
  const [{ rows, total, page, pages }, actors] = await Promise.all([
    queryAudit({ action: sp.action, actorId: sp.actor, from: sp.from, to: sp.to, page: Number(sp.page) || 1 }),
    auditActors(),
  ]);
  const qs = (p: number) => {
    const q = new URLSearchParams(Object.entries({ action: sp.action, actor: sp.actor, from: sp.from, to: sp.to }).filter(([, v]) => v) as [string, string][]);
    q.set("page", String(p));
    return `/admin/audit?${q}`;
  };
  return (
    <div className="space-y-5">
      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="action">What</Label>
          <Select id="action" name="action" defaultValue={sp.action ?? ""} className="w-48">
            {GROUPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="actor">Who</Label>
          <Select id="actor" name="actor" defaultValue={sp.actor ?? ""} className="w-48">
            <option value="">Anyone</option>
            {actors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </div>
        <div className="space-y-1.5"><Label htmlFor="from">From</Label><input id="from" name="from" type="date" defaultValue={sp.from} className="h-10 min-h-[44px] rounded-[8px] border bg-background px-3 text-sm md:min-h-10" /></div>
        <div className="space-y-1.5"><Label htmlFor="to">To</Label><input id="to" name="to" type="date" defaultValue={sp.to} className="h-10 min-h-[44px] rounded-[8px] border bg-background px-3 text-sm md:min-h-10" /></div>
        <Button type="submit" variant="secondary">Filter</Button>
        <Button asChild variant="ghost"><Link href="/api/export/audit">Download CSV</Link></Button>
      </form>

      {rows.length === 0 ? (
        <EmptyState icon={<ScrollText />} title="Nothing logged yet">Whenever an admin or lead approves, edits or changes something, it appears here.</EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y">
            {rows.map(({ a, actorName }) => (
              <li key={a.id} className="p-4 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p><span className="font-medium">{actorName ?? "System"}</span> <span className="font-mono text-sm md:text-[13px] text-muted">{a.action}</span></p>
                  <time dateTime={a.createdAt.toISOString()} className="font-mono text-[13px] md:text-[12px] text-muted">{format(a.createdAt, "MMM d, yyyy h:mm a")}</time>
                </div>
                {a.targetType ? <p className="text-[13px] md:text-[12px] text-muted">{a.targetType}{a.targetId ? ` · ${a.targetId.slice(0, 8)}` : ""}</p> : null}
                {a.before || a.after ? (
                  <details className="mt-1.5">
                    <summary className="cursor-pointer text-[13px] md:text-[12px] text-muted">Details</summary>
                    <pre className="mt-1 overflow-x-auto rounded-[6px] bg-surface p-2 font-mono text-xs md:text-[11px]">{JSON.stringify({ before: a.before, after: a.after }, null, 2)}</pre>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="flex items-center justify-between text-sm md:text-[13px] text-muted">
        <span>{total} entries</span>
        <span className="flex items-center gap-2">
          {page > 1 ? <Button asChild size="sm" variant="secondary"><Link href={qs(page - 1)}>Newer</Link></Button> : null}
          <span>Page {page} of {pages}</span>
          {page < pages ? <Button asChild size="sm" variant="secondary"><Link href={qs(page + 1)}>Older</Link></Button> : null}
        </span>
      </div>
    </div>
  );
}
