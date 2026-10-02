import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EyeOff, Trophy } from "lucide-react";
import { SeasonPicker } from "@/components/season-picker";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth/current-user";
import { getEnv } from "@/lib/env";
import { leaderboardEntries, myStats, rankEntries, type LeaderboardTab } from "@/lib/leaderboard";
import { getCurrentSeason, getSeason, listSeasons } from "@/lib/seasons";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Leaderboard" };
export const dynamic = "force-dynamic";

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ tab?: string; season?: string }> }) {
  if (!getEnv().LEADERBOARD_ENABLED) notFound(); // switched off with LEADERBOARD_ENABLED=false
  const user = await requireUser(); // parents are redirected away: they never see the leaderboard
  const sp = await searchParams;
  const tab: LeaderboardTab = sp.tab === "attendance" ? "attendance" : "hours";
  const [seasons, current] = await Promise.all([listSeasons(), getCurrentSeason()]);
  const season = (sp.season ? await getSeason(sp.season) : undefined) ?? current;
  const [{ entries, endedEvents }, me] = await Promise.all([leaderboardEntries(season.id), myStats(user.id, season.id)]);
  const ranked = rankEntries(entries, tab);
  const hidden = user.leaderboardHidden;
  const href = (t: string) => `/leaderboard?tab=${t}&season=${season.id}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leaderboard</h1>
          <p className="mt-1 text-sm text-muted">{season.name}{season.isCurrent ? "" : " · archived"}</p>
        </div>
        <SeasonPicker seasons={seasons} selectedId={season.id} keep={{ tab }} />
      </div>

      <div role="tablist" aria-label="Ranking" className="inline-flex rounded-lg border p-0.5">
        {([["hours", "Total hours"], ["attendance", "Attendance rate"]] as const).map(([t, label]) => (
          <Link key={t} role="tab" aria-selected={tab === t} href={href(t)} className={cn("inline-flex min-h-[36px] items-center rounded-md px-4 text-sm md:text-[13px] transition-colors duration-150", tab === t ? "bg-surface font-medium" : "text-muted hover:text-foreground")}>
            {label}
          </Link>
        ))}
      </div>
      {tab === "attendance" ? (
        <p className="-mt-3 text-sm md:text-[13px] text-muted">Events you attended out of {endedEvents} finished event{endedEvents === 1 ? "" : "s"} this season. Open build season days don&apos;t count.</p>
      ) : null}

      {hidden && me ? (
        <div className="flex items-start gap-3 rounded-lg border bg-surface p-4 text-sm">
          <EyeOff className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          <div>
            <p className="font-medium">You&apos;re hidden from this board</p>
            <p className="text-muted">
              Your hours still count: <span className="font-mono">{me.hours.toFixed(1)}h</span>
              {me.attendanceRate !== null ? <>, attendance <span className="font-mono">{Math.round(me.attendanceRate * 100)}%</span></> : null}. You can show yourself again in <Link href="/me" className="underline underline-offset-4">Me</Link>.
            </p>
          </div>
        </div>
      ) : null}

      {ranked.length === 0 ? (
        <EmptyState icon={<Trophy />} title="Nobody on the board yet">Hours appear here once people clock in this season.</EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <ol className="divide-y">
            {ranked.map((r) => {
              const mine = r.userId === user.id;
              return (
                <li key={r.userId} className={cn("flex items-center gap-4 px-4 py-3", mine && "bg-accent-subtle/60")}>
                  <span className="w-8 shrink-0 text-center font-mono text-sm text-muted">{r.rank === 0 ? "–" : r.rank}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {r.name} {mine ? <Badge tone="accent" className="ml-1">You</Badge> : null}
                  </span>
                  <span className="shrink-0 font-mono text-sm">
                    {tab === "hours" ? `${r.hours.toFixed(1)} h` : r.attendanceRate === null ? "No events yet" : `${Math.round(r.attendanceRate * 100)}%`}
                    {tab === "attendance" && r.attendanceRate !== null ? <span className="ml-2 text-[13px] md:text-[12px] text-muted">{r.eventsAttended}/{endedEvents}</span> : null}
                  </span>
                </li>
              );
            })}
          </ol>
        </Card>
      )}
    </div>
  );
}
