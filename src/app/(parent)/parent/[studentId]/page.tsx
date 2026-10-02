import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Clock } from "lucide-react";
import { HoursSummary, SessionList } from "@/components/session-list";
import { EmptyState } from "@/components/ui/empty-state";
import { requireParent } from "@/lib/auth/current-user";
import { ParentScopeError, studentDisplay } from "@/lib/parent-scope";
import { z } from "zod";
import { studentSessionsForParent } from "@/lib/parent-data";
import { SeasonPicker } from "@/components/season-picker";
import { getCurrentSeason, getSeason, listSeasons } from "@/lib/seasons";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Student" };
export const dynamic = "force-dynamic";

export default async function ParentStudentPage({ params, searchParams }: { params: Promise<{ studentId: string }>; searchParams: Promise<{ season?: string }> }) {
  const parent = await requireParent();
  const { studentId } = await params;
  const { season: seasonParam } = await searchParams;
  if (!z.string().uuid().safeParse(studentId).success) notFound();
  let student;
  try {
    // The only way this page learns which student it may show: the scoped helper.
    student = await studentDisplay(parent.id, studentId);
  } catch (e) {
    if (e instanceof ParentScopeError) notFound();
    throw e;
  }
  const [current, allSeasons, settings] = await Promise.all([getCurrentSeason(), listSeasons(), getSettings()]);
  const season = (seasonParam ? await getSeason(seasonParam) : undefined) ?? current;
  const sessions = await studentSessionsForParent(parent.id, student.id, season.id);
  return (
    <div className="space-y-6">
      <Link href="/parent" className="text-sm md:text-[13px] text-muted underline-offset-4 hover:underline">← All students</Link>
      <h1 className="text-2xl font-semibold tracking-tight">{student.name}</h1>
      <SeasonPicker seasons={allSeasons} selectedId={season.id} />
      <HoursSummary sessions={sessions} tz={settings.timezone} seasonLabel={season.name} />
      {sessions.length === 0 ? (
        <EmptyState icon={<Clock />} title="No attendance yet">When {student.name.split(" ")[0]} clocks in or checks in to an event, it shows up here.</EmptyState>
      ) : (
        <SessionList sessions={sessions} tz={settings.timezone} />
      )}
      <p className="text-sm md:text-[13px] text-muted">
        See upcoming events on the <Link href="/parent/calendar" className="underline underline-offset-4">calendar</Link>.
      </p>
    </div>
  );
}
