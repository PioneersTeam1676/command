import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireUser, roleAtLeast } from "@/lib/auth/current-user";
import { rosterForSeason } from "@/lib/roster";
import { getCurrentSeason, getSeason, listSeasons } from "@/lib/seasons";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Roster" };
export const dynamic = "force-dynamic";

export default async function RosterPage({ searchParams }: { searchParams: Promise<{ season?: string }> }) {
  const me = await requireUser({ min: "lead" });
  const { season: sp } = await searchParams;
  const [settings, seasons, current] = await Promise.all([getSettings(), listSeasons(), getCurrentSeason()]);
  const season = (sp ? await getSeason(sp) : undefined) ?? current;
  const rows = await rosterForSeason(season.id, settings.timezone);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form method="get" className="space-y-1.5">
          <Label htmlFor="season">Season</Label>
          <div className="flex gap-2">
            <Select id="season" name="season" defaultValue={season.id} className="w-56">
              {seasons.map((s) => <option key={s.id} value={s.id}>{s.name}{s.isCurrent ? " (current)" : ""}</option>)}
            </Select>
            <Button type="submit" variant="secondary">Show</Button>
          </div>
        </form>
        {roleAtLeast(me.role, "admin") ? (
          <Button asChild variant="secondary"><Link href={`/api/export/hours?season=${season.id}`}><Download aria-hidden />Download CSV</Link></Button>
        ) : null}
      </div>
      <Card className="overflow-hidden">
        <div className="hidden grid-cols-[1fr_90px_80px_80px_170px] gap-4 border-b bg-surface px-4 py-2 text-[12px] font-medium text-muted md:grid">
          <span>Member</span><span className="text-right">Hours</span><span className="text-right">Days</span><span className="text-right">Events</span><span>Needs attention</span>
        </div>
        <ul className="divide-y">
          {rows.map((r) => (
            <li key={r.userId}>
              <Link href={`/admin/roster/${r.userId}?season=${season.id}`} className="grid gap-1 px-4 py-3 transition-colors duration-150 hover:bg-surface md:grid-cols-[1fr_90px_80px_80px_170px] md:items-center md:gap-4">
                <span className="font-medium">{r.name} <span className="text-[12px] font-normal capitalize text-muted">{r.role}</span></span>
                <span className="font-mono text-sm md:text-right"><span className="text-muted md:hidden">Hours </span>{r.hours.toFixed(1)}</span>
                <span className="font-mono text-sm md:text-right"><span className="text-muted md:hidden">Days </span>{r.days}</span>
                <span className="font-mono text-sm md:text-right"><span className="text-muted md:hidden">Events </span>{r.eventsAttended}</span>
                <span className="flex flex-wrap gap-1">
                  {r.needsReview ? <Badge tone="warning">{r.needsReview} auto-closed</Badge> : null}
                  {r.pendingApproval ? <Badge tone="warning">{r.pendingApproval} to approve</Badge> : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
