import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/form";
import { TextField } from "@/components/form-fields";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/current-user";
import { NewSeasonDialog } from "@/components/new-season-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { gte, and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { events } from "@/db/schema";
import { getCurrentSeason, listSeasons } from "@/lib/seasons";
import { getSettings } from "@/lib/settings";
import { startOfLocalDay, todayLocal } from "@/lib/time";
import { saveSeasonAction, startSeasonAction } from "./actions";

export const metadata: Metadata = { title: "Season" };
export const dynamic = "force-dynamic";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function SeasonPage({ searchParams }: { searchParams: Promise<{ started?: string }> }) {
  await requireUser({ min: "admin" });
  const { started } = await searchParams;
  const [season, seasons, settings] = await Promise.all([getCurrentSeason(), listSeasons(), getSettings()]);
  const today = todayLocal(settings.timezone);
  const [upcoming] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(events)
    .where(and(eq(events.seasonId, season.id), gte(events.startsAt, startOfLocalDay(today, settings.timezone)), isNull(events.cancelledAt)));
  const archived = seasons.filter((s) => !s.isCurrent);
  return (
    <div className="max-w-xl space-y-6">
    {started ? <p role="status" className="rounded-[8px] border bg-success-subtle p-3 text-sm text-success">New season started. The old one is archived and still viewable.</p> : null}
    <Card>
      <CardHeader>
        <CardTitle>Current season</CardTitle>
        <CardDescription>
          During build season, members can clock in any day without an event, and daily reminders go out on your workdays.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ActionForm action={saveSeasonAction} className="space-y-4">
          <TextField name="name" label="Season name" defaultValue={season.name} required maxLength={80} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField name="buildStart" label="Build season starts" type="date" defaultValue={season.buildStart ?? ""} help="Leave both dates empty if you're not in build season." />
            <TextField name="buildEnd" label="Build season ends" type="date" defaultValue={season.buildEnd ?? ""} />
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Workdays</legend>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d, i) => (
                <label key={d} className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-[8px] border px-3 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-subtle">
                  <input type="checkbox" name="workdays" value={i} defaultChecked={season.workdays.includes(i)} className="size-4 accent-[var(--accent)]" />
                  {d}
                </label>
              ))}
            </div>
            <p className="mt-2 text-sm md:text-[13px] text-muted">Reminders only go out on these days. Members can still clock in on other days inside build season.</p>
          </fieldset>
          <SubmitButton pendingText="Saving…">Save season</SubmitButton>
        </ActionForm>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Start a new season</CardTitle>
        <CardDescription>Do this once a year when your team begins a new season. Hours and the leaderboard reset; the old season is kept.</CardDescription>
      </CardHeader>
      <CardContent>
        <NewSeasonDialog action={startSeasonAction} currentName={season.name} today={today} splitDate={today} upcomingCount={upcoming?.n ?? 0} />
      </CardContent>
    </Card>

    {archived.length > 0 ? (
      <Card>
        <CardHeader>
          <CardTitle>Archived seasons</CardTitle>
          <CardDescription>Kept forever. Open any of them to see hours, the leaderboard or download data.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {archived.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <span>
                  <span className="font-medium">{a.name}</span> <Badge>Archived</Badge>
                  <span className="ml-2 font-mono text-[13px] md:text-[12px] text-muted">{a.startDate} – {a.endDate ?? "?"}</span>
                </span>
                <span className="flex gap-2">
                  <Button asChild size="sm" variant="secondary"><Link href={`/admin/roster?season=${a.id}`}>Roster</Link></Button>
                  <Button asChild size="sm" variant="secondary"><Link href={`/leaderboard?season=${a.id}`}>Leaderboard</Link></Button>
                  <Button asChild size="sm" variant="secondary"><Link href={`/api/export/hours?season=${a.id}`}>Hours CSV</Link></Button>
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    ) : null}
    </div>
  );
}
